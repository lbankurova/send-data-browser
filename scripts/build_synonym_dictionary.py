"""Build the SENDEX finding-synonyms dictionary from three upstream sources.

Sources (parsed in this order; conflict resolution: CDISC > sendigR > eTRANSAFE):
  1. CDISC SEND CT codelist TSVs at scripts/data/source/cdisc-send-ct/
     - NONNEO.tsv (MI domain), NEOPLASM.tsv (MI domain),
       MARES.tsv (MA domain), CLOBS.tsv (CL domain).
     - File format: NCI-EVS published TSVs with columns:
         Code | Codelist Code | Codelist Extensible (Yes/No) | Codelist Name |
         CDISC Submission Value | CDISC Synonym(s) | CDISC Definition |
         NCI Preferred Term
     - Submission Value is the canonical term; Synonym(s) is semicolon-separated
       aliases; Code is the NCIt identifier (e.g. C28499).
  2. sendigR xptcleaner JSON vocabularies at scripts/data/source/sendigr-xptcleaner/
     - One JSON file per codelist (nonneo_vocab.json, mares_vocab.json,
       clobs_vocab.json). Format: flat dict {alias_string: preferred_term_string}.
  3. eTRANSAFE SEND-SNOMED mappings at scripts/data/source/etransafe-send-snomed/
     - SSSOM-style CSV: subject_id, subject_label, predicate_id, object_id,
       object_label, mapping_group, snomed_id.
     - When two subject_label rows share an object_id (skos:exactMatch to the
       same SNOMED concept), they are treated as synonyms of each other.
     - The snomed_id column is parsed for internal validation but **stripped**
       from the output JSON (research R1 F4 — SNOMED CT IP).

Output: shared/config/finding-synonyms.json with the schema documented in
the build plan (see docs/_internal/incoming/etransafe-send-snomed-integration-synthesis.md
Feature 1).

Idempotency: same sources + same version inputs -> byte-identical output. The
script sorts every collection deterministically before serialization. Tests
exercise this against a fixture source workspace and assert byte-identity.

Monotonic growth (AC-1.7): if --previous is passed, the script asserts every
canonical and alias from the previous version exists in the new version. The
escape hatch is --allow-removal=path/to/allowlist.txt where each entry has
{"term": "...", "reason": "..."}; generic bypass flags are rejected.

Volume retention (AC-1.9): per-domain entry count must be at least
--min-retention-pct of the previous version (default 95).

Corpus regression (AC-1.10): if --corpus-snapshot is passed, the script
reports the resolved-vs-unresolved breakdown per domain and FAILS if the
resolved fraction drops below the previous run's fraction.

Run:
    python scripts/build_synonym_dictionary.py \\
        --sources scripts/data/source \\
        --out shared/config/finding-synonyms.json

NOTE on the SNOMED ID strip (research R1 F4): the eTRANSAFE source carries
SNOMED CT identifiers under CC BY 4.0. We parse them for internal cross-checks
but never write them to the output artifact. NCIt codes (public domain) are
the stable cross-reference identifier in the committed JSON.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCES = REPO_ROOT / "scripts" / "data" / "source"
DEFAULT_OUT = REPO_ROOT / "shared" / "config" / "finding-synonyms.json"

# CDISC codelist filename -> SEND domain mapping. NONNEO and NEOPLASM both
# feed MI; MARES feeds MA; CLOBS feeds CL.
CODELIST_TO_DOMAIN: dict[str, str] = {
    "NONNEO": "MI",
    "NEOPLASM": "MI",
    "MARES": "MA",
    "CLOBS": "CL",
}

# CDISC TSV column names (NCI-EVS publication format).
CDISC_REQUIRED_COLUMNS = {
    "Code",
    "Codelist Code",
    "CDISC Submission Value",
    "CDISC Synonym(s)",
}

# eTRANSAFE SSSOM CSV required columns.
ETRANSAFE_REQUIRED_COLUMNS = {
    "subject_id",
    "subject_label",
    "predicate_id",
    "object_id",
    "object_label",
    "mapping_group",
}

# Source provenance tags written into the entry source[] arrays.
SOURCE_TAG_NONNEO = "NONNEO"
SOURCE_TAG_NEOPLASM = "NEOPLASM"
SOURCE_TAG_MARES = "MARES"
SOURCE_TAG_CLOBS = "CLOBS"
SOURCE_TAG_SENDIGR = "sendigR"
SOURCE_TAG_ETRANSAFE = "eTRANSAFE"

CODELIST_TO_SOURCE_TAG = {
    "NONNEO": SOURCE_TAG_NONNEO,
    "NEOPLASM": SOURCE_TAG_NEOPLASM,
    "MARES": SOURCE_TAG_MARES,
    "CLOBS": SOURCE_TAG_CLOBS,
}

# Curated qualifier lexicon extracted from NONNEO 'QUALIFIER FINDING' left-sides
# during dictionary build. Conservative initial set; extend in future cycles via
# RG-C-4 calibration. Used by extract_base_concept() in send_knowledge.py.
INITIAL_QUALIFIER_LEXICON: list[str] = sorted({
    "HEPATOCELLULAR",
    "FOLLICULAR CELL",
    "FOLLICULAR",
    "CENTRILOBULAR",
    "PERIACINAR",
    "PERIPORTAL",
    "MIDZONAL",
    "TUBULAR",
    "GLOMERULAR",
    "INTERSTITIAL",
    "ALVEOLAR",
    "BRONCHIOLAR",
    "DUCTULAR",
    "GLANDULAR",
    "MUCOSAL",
    "EPITHELIAL",
    "ENDOTHELIAL",
    "MULTIFOCAL",
    "DIFFUSE",
    "FOCAL",
    "MARKED",
    "MODERATE",
    "MILD",
    "ACUTE",
    "CHRONIC",
    "MIXED CELL",
    "MONONUCLEAR CELL",
    "GRANULOCYTIC",
    "NEUTROPHILIC",
    "HETEROPHILIC",
})

# Severity modifiers — words that look like prefix qualifiers but actually
# encode the MISEV severity grade. The base-concept extractor MUST reject
# decompositions where the would-be qualifier is in this set, otherwise
# `MINIMAL NEPHROPATHY` would falsely decompose to ("NEPHROPATHY", "MINIMAL").
INITIAL_SEVERITY_MODIFIERS: list[str] = sorted({
    "MINIMAL",
    "SLIGHT",
    "MILD",
    "MODERATE",
    "MARKED",
    "SEVERE",
})


# ---------------------------------------------------------------------------
# Source parsers
# ---------------------------------------------------------------------------

def _fail(msg: str) -> "NoReturn":
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def parse_cdisc_tsv(path: Path) -> list[dict]:
    """Parse a single CDISC SEND CT codelist TSV file.

    Returns a list of {canonical, ncit_code, aliases, definition, codelist}
    rows. The codelist header row (the row whose Code column equals the
    codelist's parent code, with no Submission Value) is skipped.

    Raises:
        SystemExit on schema mismatch (missing required columns) — fail-fast
        per AC-1.8 input-schema validation. Silent row-skipping is not OK.
    """
    if not path.exists():
        _fail(f"CDISC source file missing: {path}")
    rows: list[dict] = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        if reader.fieldnames is None:
            _fail(f"{path}: empty file or missing header")
        missing = CDISC_REQUIRED_COLUMNS - set(reader.fieldnames)
        if missing:
            _fail(
                f"{path}: missing required columns {sorted(missing)}. "
                f"Expected NCI-EVS CDISC SEND CT TSV format with columns: "
                f"{sorted(CDISC_REQUIRED_COLUMNS)}. "
                f"Got: {reader.fieldnames}"
            )
        codelist_name = path.stem.upper()  # NONNEO, MARES, etc.
        for row_idx, row in enumerate(reader, start=2):  # 1-based + header
            submission_value = (row.get("CDISC Submission Value") or "").strip()
            ncit_code = (row.get("Code") or "").strip()
            if not submission_value:
                continue
            # Skip the codelist header row -- it lists the codelist's own name
            # as Submission Value (e.g. row where CDISC Submission Value ==
            # codelist file stem).
            if submission_value.upper() == codelist_name:
                continue
            if not ncit_code:
                _fail(
                    f"{path} row {row_idx}: NCIt Code is empty for "
                    f"submission value '{submission_value}'. Every term must "
                    f"have an NCIt code."
                )
            synonyms_raw = (row.get("CDISC Synonym(s)") or "").strip()
            synonyms = [
                s.strip().upper()
                for s in synonyms_raw.split(";")
                if s.strip()
            ]
            # The submission value itself often appears in the synonyms list;
            # dedupe by collecting both into a set.
            aliases_set = {s for s in synonyms if s != submission_value.upper()}
            rows.append({
                "canonical": submission_value.upper(),
                "ncit_code": ncit_code,
                "aliases": sorted(aliases_set),
                "definition": (row.get("CDISC Definition") or "").strip(),
                "codelist": codelist_name,
            })
    return rows


def parse_sendigr_vocab(path: Path) -> dict[str, str]:
    """Parse a sendigR xptcleaner JSON vocab file.

    Returns a flat {alias_upper: preferred_upper} dict. Underscore-prefixed
    keys are treated as metadata and skipped.

    Raises:
        SystemExit on schema mismatch (file is not a flat JSON dict).
    """
    if not path.exists():
        _fail(f"sendigR source file missing: {path}")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        _fail(
            f"{path}: expected JSON object (flat alias->preferred map), "
            f"got {type(data).__name__}"
        )
    out: dict[str, str] = {}
    for k, v in data.items():
        if k.startswith("_"):
            continue  # metadata key
        if not isinstance(k, str) or not isinstance(v, str):
            _fail(
                f"{path}: every entry must be string->string. "
                f"Bad entry: {k!r} -> {v!r}"
            )
        out[k.upper().strip()] = v.upper().strip()
    return out


def parse_etransafe_csv(path: Path) -> list[dict]:
    """Parse an eTRANSAFE SSSOM-style CSV mapping file.

    Returns a list of {subject_label, object_id, mapping_group, snomed_id}
    dicts. snomed_id is parsed for internal cross-checks but is NEVER
    written to the output JSON.

    Raises:
        SystemExit on schema mismatch.
    """
    if not path.exists():
        _fail(f"eTRANSAFE source file missing: {path}")
    rows: list[dict] = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            _fail(f"{path}: empty file or missing header")
        missing = ETRANSAFE_REQUIRED_COLUMNS - set(reader.fieldnames)
        if missing:
            _fail(
                f"{path}: missing required columns {sorted(missing)}. "
                f"Expected SSSOM-style CSV: "
                f"{sorted(ETRANSAFE_REQUIRED_COLUMNS)}. Got: {reader.fieldnames}"
            )
        for row_idx, row in enumerate(reader, start=2):
            subject_label = (row.get("subject_label") or "").strip()
            object_id = (row.get("object_id") or "").strip()
            if not subject_label or not object_id:
                continue
            rows.append({
                "subject_label": subject_label.upper(),
                "object_id": object_id,
                "mapping_group": (row.get("mapping_group") or "").strip(),
                "snomed_id": (row.get("snomed_id") or "").strip(),
            })
    return rows


# ---------------------------------------------------------------------------
# Merge logic
# ---------------------------------------------------------------------------

def _empty_entry(canonical: str) -> dict:
    return {
        "canonical": canonical,
        "ncit_code": None,
        "aliases": set(),
        "base_concept": canonical,
        "qualifier": None,
        "source": set(),
    }


def merge_sources(
    cdisc_rows_by_codelist: dict[str, list[dict]],
    sendigr_by_codelist: dict[str, dict[str, str]],
    etransafe_rows: list[dict],
) -> dict[str, dict[str, dict]]:
    """Merge the three source layers into per-domain entries.

    Conflict rules:
        - CDISC canonical wins over sendigR preferred wins over eTRANSAFE
          object cluster (research R2 N2 + spec build plan).
        - Aliases from all three layers are unioned into the canonical's
          alias list.
        - source[] records every layer that contributed to the canonical
          OR any of its aliases. NONNEO/NEOPLASM/MARES/CLOBS tags come from
          the CDISC layer; sendigR tag from layer 2; eTRANSAFE tag from layer 3.

    Returns:
        {domain: {canonical: entry_dict}} with sets for aliases/source.
    """
    # Pass 1: seed canonicals from CDISC. CDISC canonicals take priority.
    domains: dict[str, dict[str, dict]] = {"MI": {}, "MA": {}, "CL": {}}

    for codelist, rows in cdisc_rows_by_codelist.items():
        domain = CODELIST_TO_DOMAIN.get(codelist)
        if domain is None:
            continue
        source_tag = CODELIST_TO_SOURCE_TAG[codelist]
        for row in rows:
            canonical = row["canonical"]
            entry = domains[domain].setdefault(canonical, _empty_entry(canonical))
            # CDISC priority: only set ncit_code if not already set by an earlier
            # CDISC codelist for the same canonical (rare; e.g. SCAB appears in
            # NONNEO, MARES, CLOBS — first one wins).
            if entry["ncit_code"] is None:
                entry["ncit_code"] = row["ncit_code"]
            for a in row["aliases"]:
                if a != canonical:
                    entry["aliases"].add(a)
            entry["source"].add(source_tag)

    # Pass 2: layer in sendigR. Each {alias: preferred} pair creates an alias
    # under the preferred canonical IF the canonical already exists in the
    # CDISC layer for that domain. Bare preferred terms not seen in CDISC are
    # added as new entries (sendigR is then the only source).
    sendigr_codelist_to_domain = {
        "nonneo_vocab": "MI",
        "neoplasm_vocab": "MI",
        "mares_vocab": "MA",
        "clobs_vocab": "CL",
    }
    for filename_stem, vocab in sendigr_by_codelist.items():
        domain = sendigr_codelist_to_domain.get(filename_stem)
        if domain is None:
            continue
        for alias, preferred in vocab.items():
            entry = domains[domain].setdefault(preferred, _empty_entry(preferred))
            if alias != preferred:
                entry["aliases"].add(alias)
            entry["source"].add(SOURCE_TAG_SENDIGR)

    # Pass 3: layer in eTRANSAFE. Cluster subject_labels by object_id; within
    # each cluster, the lex-first label becomes a candidate canonical (only
    # used if no CDISC/sendigR canonical already exists in the appropriate
    # domain) and the others become aliases. Mapping_group narrows the domain.
    by_object: dict[str, list[dict]] = {}
    for row in etransafe_rows:
        by_object.setdefault(row["object_id"], []).append(row)

    etransafe_to_domain = {
        "NONNEO": "MI",
        "NEOPLASM": "MI",
        "MARES": "MA",
        "CLOBS": "CL",
    }
    for object_id, cluster in by_object.items():
        # Determine domain from the first row's mapping_group (clusters
        # may span codelists in theory but in practice are codelist-scoped).
        domain = None
        for r in cluster:
            d = etransafe_to_domain.get(r["mapping_group"].upper())
            if d:
                domain = d
                break
        if domain is None:
            continue
        # Pick the canonical: prefer one that already exists in the
        # CDISC/sendigR layer for that domain. Otherwise, lex-first.
        existing_canonical = None
        for r in cluster:
            if r["subject_label"] in domains[domain]:
                existing_canonical = r["subject_label"]
                break
        if existing_canonical is None:
            existing_canonical = sorted(r["subject_label"] for r in cluster)[0]
        entry = domains[domain].setdefault(
            existing_canonical, _empty_entry(existing_canonical)
        )
        for r in cluster:
            label = r["subject_label"]
            if label != existing_canonical:
                entry["aliases"].add(label)
        entry["source"].add(SOURCE_TAG_ETRANSAFE)
        # snomed_id is intentionally NOT propagated to the entry — strip per
        # research R1 F4 (SNOMED CT IP). The variable is parsed only so that
        # the source file's schema is validated.

    return domains


def serialize_domains(domains: dict[str, dict[str, dict]]) -> dict:
    """Convert merge output (with sets) to deterministic JSON-serializable form.

    All collections sorted; sets converted to sorted lists; canonicals iterated
    in sorted order. Same input -> byte-identical output (idempotency, AC-1.5).
    """
    out: dict[str, dict] = {}
    for domain in sorted(domains.keys()):
        entries_in = domains[domain]
        out_entries: dict[str, dict] = {}
        for canonical in sorted(entries_in.keys()):
            entry = entries_in[canonical]
            out_entries[canonical] = {
                "canonical": entry["canonical"],
                "ncit_code": entry["ncit_code"],
                "aliases": sorted(entry["aliases"]),
                "base_concept": entry["base_concept"],
                "qualifier": entry["qualifier"],
                "source": sorted(entry["source"]),
            }
        out[domain] = {"entries": out_entries}
    return out


# ---------------------------------------------------------------------------
# Monotonic growth (AC-1.7) + volume retention (AC-1.9)
# ---------------------------------------------------------------------------

def load_allowlist(path: Path) -> dict[str, str]:
    """Load and validate the per-term removal allowlist (AC-1.7 escape hatch).

    Schema: list of {"term": "...", "reason": "..."} entries. Both fields
    must be non-empty strings. Generic bypass flags are rejected.

    Returns:
        {term_upper: reason} dict.
    """
    if not path.exists():
        _fail(f"--allow-removal file missing: {path}")
    with open(path, encoding="utf-8") as f:
        try:
            entries = json.load(f)
        except json.JSONDecodeError as e:
            _fail(f"{path}: invalid JSON ({e})")
    if not isinstance(entries, list):
        _fail(f"{path}: expected list of allowlist entries, got {type(entries).__name__}")
    out: dict[str, str] = {}
    for i, entry in enumerate(entries):
        if not isinstance(entry, dict):
            _fail(f"{path} entry {i}: expected object, got {type(entry).__name__}")
        term = entry.get("term")
        reason = entry.get("reason")
        if not isinstance(term, str) or not term.strip():
            _fail(f"{path} entry {i}: missing or empty 'term' field")
        if not isinstance(reason, str) or not reason.strip():
            _fail(
                f"{path} entry {i}: missing or empty 'reason' field — "
                f"per-term removal requires human-written justification."
            )
        out[term.upper().strip()] = reason
    return out


def check_monotonic_growth(
    new_serialized: dict,
    previous_path: Path | None,
    allowlist: dict[str, str],
) -> None:
    """Assert every prior canonical/alias still exists in the new build.

    Allowed removals must be enumerated in the allowlist. Fails fast on
    non-allowlisted regressions.
    """
    if previous_path is None or not previous_path.exists():
        return
    with open(previous_path, encoding="utf-8") as f:
        prev = json.load(f)
    prev_domains = prev.get("domains", {})
    new_domains = new_serialized.get("domains", {})
    removed: list[str] = []
    for domain, dprev in prev_domains.items():
        dnew_entries = new_domains.get(domain, {}).get("entries", {})
        for canonical, prev_entry in dprev.get("entries", {}).items():
            new_entry = dnew_entries.get(canonical)
            if new_entry is None:
                if canonical.upper() not in allowlist:
                    removed.append(f"canonical: {domain}.{canonical}")
                continue
            prev_aliases = set(prev_entry.get("aliases", []))
            new_aliases = set(new_entry.get("aliases", []))
            for a in prev_aliases - new_aliases:
                if a.upper() not in allowlist:
                    removed.append(f"alias: {domain}.{canonical}.{a}")
    if removed:
        msg = "Monotonic growth violation. Removed terms not in allowlist:\n"
        for r in removed[:30]:
            msg += f"  {r}\n"
        if len(removed) > 30:
            msg += f"  ...({len(removed) - 30} more)\n"
        _fail(msg)


def check_volume_retention(
    new_serialized: dict,
    previous_path: Path | None,
    min_pct: float,
) -> None:
    """Per-domain entry count must be >= min_pct of previous version."""
    if previous_path is None or not previous_path.exists():
        return
    with open(previous_path, encoding="utf-8") as f:
        prev = json.load(f)
    new_domains = new_serialized.get("domains", {})
    prev_domains = prev.get("domains", {})
    failures: list[str] = []
    for domain in prev_domains:
        prev_count = len(prev_domains[domain].get("entries", {}))
        new_count = len(new_domains.get(domain, {}).get("entries", {}))
        if prev_count == 0:
            continue
        ratio = new_count / prev_count
        if ratio < (min_pct / 100.0):
            failures.append(
                f"  {domain}: prev={prev_count}, new={new_count}, "
                f"ratio={ratio:.2%} < min={min_pct}%"
            )
    if failures:
        _fail(
            "Volume retention check failed (AC-1.9). A parser may be silently "
            "dropping rows:\n" + "\n".join(failures)
        )


# ---------------------------------------------------------------------------
# Corpus regression (AC-1.10)
# ---------------------------------------------------------------------------

def check_corpus_snapshot(
    new_serialized: dict,
    snapshot_path: Path | None,
    previous_out_path: Path | None,
    strict: bool,
) -> dict[str, dict]:
    """Compute resolved-vs-unresolved breakdown per domain against the corpus.

    Reads scripts/data/sendex_corpus_terms_snapshot.json (or the path passed
    via --corpus-snapshot). Each domain's distinct raw test_code values are
    matched against the new dictionary's canonicals + aliases.

    Returns:
        {domain: {resolved: int, unresolved: int, total: int, fraction: float}}.
    """
    if snapshot_path is None or not snapshot_path.exists():
        return {}
    with open(snapshot_path, encoding="utf-8") as f:
        snapshot = json.load(f)
    domains_snapshot = snapshot.get("domains", {})
    new_domains = new_serialized.get("domains", {})

    breakdown: dict[str, dict] = {}
    for domain, raws in domains_snapshot.items():
        entries = new_domains.get(domain, {}).get("entries", {})
        all_keys: set[str] = set()
        for canonical, entry in entries.items():
            all_keys.add(canonical.upper())
            for a in entry.get("aliases", []):
                all_keys.add(a.upper())
        resolved = 0
        unresolved = 0
        for r in raws:
            if r.upper().strip() in all_keys:
                resolved += 1
            else:
                unresolved += 1
        total = resolved + unresolved
        breakdown[domain] = {
            "resolved": resolved,
            "unresolved": unresolved,
            "total": total,
            "fraction": (resolved / total) if total > 0 else None,
        }

    # Compare against previous run if available
    if previous_out_path and previous_out_path.exists():
        with open(previous_out_path, encoding="utf-8") as f:
            prev = json.load(f)
        prev_breakdown = (
            prev.get("_corpus_breakdown", {}) if isinstance(prev, dict) else {}
        )
        regressions: list[str] = []
        for domain, b in breakdown.items():
            prev_b = prev_breakdown.get(domain)
            if prev_b is None:
                continue
            if b["fraction"] is None or prev_b.get("fraction") is None:
                continue
            if b["fraction"] < prev_b["fraction"]:
                regressions.append(
                    f"  {domain}: prev={prev_b['fraction']:.2%}, "
                    f"new={b['fraction']:.2%}"
                )
        if regressions:
            _fail(
                "Corpus coverage regression (AC-1.10):\n" + "\n".join(regressions)
            )

    # Freshness check: every generated study in the snapshot must be on disk.
    studies_in_snapshot = {
        s["study_id"] for s in snapshot.get("studies", [])
    }
    gen_dir = REPO_ROOT / "backend" / "generated"
    actual_studies: set[str] = set()
    if gen_dir.exists():
        for sd in gen_dir.iterdir():
            if (sd / "unified_findings.json").exists():
                actual_studies.add(sd.name)
    snapshot_only = studies_in_snapshot - actual_studies
    actual_only = actual_studies - studies_in_snapshot
    if snapshot_only or actual_only:
        msg = (
            "Corpus snapshot freshness mismatch:\n"
            f"  in snapshot but not on disk: {sorted(snapshot_only)}\n"
            f"  on disk but not in snapshot: {sorted(actual_only)}\n"
            "  Run scripts/build_corpus_terms_snapshot.py to refresh."
        )
        if strict:
            _fail(msg)
        else:
            print(f"WARN: {msg}", file=sys.stderr)

    return breakdown


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def build(
    sources_dir: Path,
    out_path: Path,
    previous_path: Path | None,
    allow_removal_path: Path | None,
    min_retention_pct: float,
    corpus_snapshot_path: Path | None,
    strict_snapshot: bool,
    cdisc_version: str,
    sendigr_commit: str,
    etransafe_commit: str,
) -> dict:
    """Build the merged dictionary and (when checks pass) write the output."""
    # Pass 1: parse all sources.
    cdisc_dir = sources_dir / "cdisc-send-ct"
    cdisc_rows: dict[str, list[dict]] = {}
    for codelist in CODELIST_TO_DOMAIN:
        path = cdisc_dir / f"{codelist}.tsv"
        if not path.exists():
            print(
                f"WARN: CDISC codelist {codelist} not found at {path}; skipping",
                file=sys.stderr,
            )
            continue
        cdisc_rows[codelist] = parse_cdisc_tsv(path)

    sendigr_dir = sources_dir / "sendigr-xptcleaner"
    sendigr_by_file: dict[str, dict[str, str]] = {}
    if sendigr_dir.exists():
        for path in sorted(sendigr_dir.glob("*.json")):
            sendigr_by_file[path.stem] = parse_sendigr_vocab(path)

    etransafe_dir = sources_dir / "etransafe-send-snomed"
    etransafe_rows: list[dict] = []
    if etransafe_dir.exists():
        for path in sorted(etransafe_dir.glob("*.csv")):
            etransafe_rows.extend(parse_etransafe_csv(path))

    # Pass 2: merge.
    domains_internal = merge_sources(cdisc_rows, sendigr_by_file, etransafe_rows)

    # Pass 3: serialize deterministically.
    serialized_domains = serialize_domains(domains_internal)

    output = {
        "version": "1.0.0",
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z"),
        "sources": {
            "cdisc_send_ct_version": cdisc_version,
            "sendigr_commit": sendigr_commit,
            "etransafe_commit": etransafe_commit,
        },
        "scope": {
            "domains_in_scope": ["MI", "MA", "CL"],
            "domains_out_of_scope": ["OM", "TF", "DS"],
            "note": (
                "OM/TF/DS test_codes remain at level 6 'no_dictionary' until "
                "a future cycle. Phase B/C ships MI/MA/CL only."
            ),
        },
        "external_identifier_strip_notice": (
            "External-identifier fields from upstream sources (e.g., the "
            "snomed identifier carried by eTRANSAFE) are deliberately stripped "
            "from this artifact (research R1 F4). NCIt codes are the stable "
            "public-domain cross-reference. See "
            "scripts/build_synonym_dictionary.py for the strip logic."
        ),
        "qualifiers": INITIAL_QUALIFIER_LEXICON,
        "severity_modifiers": INITIAL_SEVERITY_MODIFIERS,
        "domains": serialized_domains,
    }

    # Pass 4: regression checks.
    allowlist = load_allowlist(allow_removal_path) if allow_removal_path else {}
    check_monotonic_growth(output, previous_path, allowlist)
    check_volume_retention(output, previous_path, min_retention_pct)
    breakdown = check_corpus_snapshot(
        output, corpus_snapshot_path, previous_path, strict_snapshot
    )
    if breakdown:
        output["_corpus_breakdown"] = breakdown

    return output


def write_output(output: dict, out_path: Path, freeze_timestamp: bool) -> None:
    """Write the output JSON deterministically.

    When freeze_timestamp is True, generated_at is replaced with a fixed
    placeholder so byte-identity tests pass across reruns. Production
    invocations leave the real timestamp.
    """
    if freeze_timestamp:
        output = dict(output)
        output["generated_at"] = "FROZEN-FOR-TEST"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(output, f, indent=2, sort_keys=False, ensure_ascii=True)
        f.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build the SENDEX finding-synonyms dictionary",
    )
    parser.add_argument(
        "--sources",
        type=Path,
        default=DEFAULT_SOURCES,
        help="Source workspace directory (default: scripts/data/source/)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="Output JSON path (default: shared/config/finding-synonyms.json)",
    )
    parser.add_argument(
        "--previous",
        type=Path,
        default=None,
        help="Previous version of the output for monotonic-growth checking",
    )
    parser.add_argument(
        "--allow-removal",
        type=Path,
        default=None,
        help=(
            "Per-term removal allowlist JSON. Each entry must be "
            "{'term': '...', 'reason': '...'}. Generic bypass flags rejected."
        ),
    )
    parser.add_argument(
        "--min-retention-pct",
        type=float,
        default=95.0,
        help="Minimum per-domain entry retention percentage (default 95)",
    )
    parser.add_argument(
        "--corpus-snapshot",
        type=Path,
        default=None,
        help="Path to corpus terms snapshot for resolved/unresolved reporting",
    )
    parser.add_argument(
        "--strict-snapshot",
        action="store_true",
        help="Fail on corpus snapshot freshness mismatch (vs warn)",
    )
    parser.add_argument(
        "--cdisc-version",
        default="2026-03-27-bootstrap",
        help="CDISC SEND CT version label written into output sources block",
    )
    parser.add_argument(
        "--sendigr-commit",
        default="bootstrap",
        help="sendigR git SHA written into output sources block",
    )
    parser.add_argument(
        "--etransafe-commit",
        default="bootstrap",
        help="eTRANSAFE git SHA written into output sources block",
    )
    parser.add_argument(
        "--freeze-timestamp",
        action="store_true",
        help="Freeze generated_at to a fixed value (for byte-identity tests)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = build(
        sources_dir=args.sources,
        out_path=args.out,
        previous_path=args.previous,
        allow_removal_path=args.allow_removal,
        min_retention_pct=args.min_retention_pct,
        corpus_snapshot_path=args.corpus_snapshot,
        strict_snapshot=args.strict_snapshot,
        cdisc_version=args.cdisc_version,
        sendigr_commit=args.sendigr_commit,
        etransafe_commit=args.etransafe_commit,
    )
    write_output(output, args.out, freeze_timestamp=args.freeze_timestamp)

    # Print summary
    summary = []
    for d, payload in output["domains"].items():
        summary.append(f"{d}={len(payload['entries'])}")
    print(
        f"Built {args.out} with domains: {', '.join(summary)}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
