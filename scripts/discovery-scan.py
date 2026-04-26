#!/usr/bin/env python3
"""
Discovery scan -- pcc-configured.

Heuristic gap detection across pcc's manifests, registries, and code. Output
is a ranked markdown report listing knowledge/architecture/coverage gaps the
agent could plausibly act on.

Goal: validate whether the gap signal is high-quality enough to wire into
autopilot's `--discover` mode, before investing in graph infrastructure.
Target on first run: 80%+ of items should be real gaps a human reads as
"yes, that's a thing".

Lattice users: this script is heavily pcc-driven. Fork to your project, edit
SCAN_CONFIG paths to your manifests, and adapt each scan_*() function to
your conventions. The lattice copy at lattice/scripts/discovery-scan.py is
the template version with placeholder paths.

Run: python scripts/discovery-scan.py
Output: scripts/data/discovery-report.md (markdown report) + console summary.
"""

from __future__ import annotations

import re
import sys
import traceback
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable

try:
    import yaml
except ImportError:
    print("Missing pyyaml. Install: pip install pyyaml", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent

SCAN_CONFIG = {
    "capabilities":         ROOT / "docs/_internal/capabilities.yaml",
    "system_manifest":      ROOT / "docs/_internal/knowledge/system-manifest.md",
    "architecture_dir":     ROOT / "docs/_internal/architecture",
    "methods_index":        ROOT / "docs/_internal/knowledge/methods-index.md",
    "analysis_dir":         ROOT / "backend/services/analysis",
    "validation_dir":       ROOT / "docs/validation/references",
    "species_profiles":     ROOT / "docs/_internal/knowledge/species-profiles.md",
    "research_registry":    ROOT / "docs/_internal/research/REGISTRY.md",
    "roadmap":              ROOT / "docs/_internal/ROADMAP.md",
    "todo":                 ROOT / "docs/_internal/TODO.md",
    "knowledge_dir":        ROOT / "docs/_internal/knowledge",
    "literature_dir":       ROOT / "docs/_internal/research/literature",
}

OUTPUT_PATH = ROOT / "scripts/data/discovery-report.md"


@dataclass
class Gap:
    category: str
    item: str
    suggestion: str
    evidence: str
    safe: bool          # deterministic / no science judgement needed
    severity: str = "medium"  # high | medium | low


# =============================================================================
# Scan 1 -- Subsystems flagged as needing Layer 1 doc but architecture/ has none
# =============================================================================

def scan_subsystems_missing_architecture() -> list[Gap]:
    text = SCAN_CONFIG["system_manifest"].read_text(encoding="utf-8")
    arch_files = list(SCAN_CONFIG["architecture_dir"].glob("*.md"))
    arch_corpus = "\n".join(p.read_text(encoding="utf-8") for p in arch_files).lower()
    arch_names = {p.stem.lower() for p in arch_files}

    # Parse rows of the subsystem catalog table:
    # | S01 | Findings Pipeline | ... | ... | -- |
    row_re = re.compile(
        r"^\|\s*(S\d{2}|OV)\s*\|\s*([^|]+?)\s*\|\s*[^|]+\|\s*[^|]+\|\s*([^|]+?)\s*\|",
        re.MULTILINE,
    )
    gaps: list[Gap] = []
    for m in row_re.finditer(text):
        sid, name, layer1 = m.group(1), m.group(2).strip(), m.group(3).strip()
        if layer1 != "--":
            continue  # already has a Layer 1 doc

        # Heuristic: does any architecture/*.md mention this subsystem by name or ID?
        name_tokens = re.split(r"[\s\-/]+", name.lower())
        # Must match the multi-word name OR a unique-enough key token
        cited_by_name = name.lower() in arch_corpus
        cited_by_id = re.search(rf"\b{sid.lower()}\b", arch_corpus) is not None
        # Also accept filename match
        slug_variants = {
            name.lower().replace(" ", "-"),
            "-".join(t for t in name_tokens if t),
        }
        cited_by_filename = bool(slug_variants & arch_names)

        if cited_by_name or cited_by_id or cited_by_filename:
            continue

        gaps.append(Gap(
            category="subsystem-missing-architecture",
            item=f"{sid}: {name}",
            suggestion=f"Write architecture/{name.lower().replace(' ', '-')}.md (Layer 1 doc)",
            evidence=f"system-manifest.md row {sid} (Layer 1 = '--', no arch/* mentions name or ID)",
            safe=True,
            severity="medium",
        ))
    return gaps


# =============================================================================
# Scan 2 -- Methods-index drift (REMOVED, kept stub for documentation)
# =============================================================================
#
# Earlier draft scanned `backend/services/analysis/*.py` for public functions
# not cited in methods-index.md. Result was ~190 hits, almost all internal
# helpers (analysis_cache.read_cache, etc.). methods-index catalogues
# *scientific* methods (statistical tests, algorithms with literature
# backing) -- not every public function. The right scan for methods-index
# health is the inverse: read methods-index for "Implementation: file:func"
# pointers and verify each resolves. That's a methods-index lint, not a
# discovery scan; belongs in a separate `audit-methods-index.py` script.
#
# Scan removed from the discovery scan to keep signal-to-noise high.


# =============================================================================
# Scan 3 -- Species exercised in validation studies but not profiled
# =============================================================================

# Synonym map: validation YAML species -> canonical names that appear in
# species-profiles.md. Add entries here if a new validation study uses a
# species name that profiles file calls something different.
SPECIES_SYNONYMS = {
    "primate":         ["monkey", "cynomolgus", "macaca", "macaque", "nhp"],
    "non-human primate": ["monkey", "cynomolgus", "macaca", "macaque", "nhp"],
    "nhp":             ["monkey", "cynomolgus", "macaca", "macaque"],
    "rat":             ["rat", "sprague", "wistar", "fischer", "f344"],
    "mouse":           ["mouse", "mice", "b6c3f1", "cd-1"],
    "dog":             ["dog", "beagle", "canine"],
    "rabbit":          ["rabbit", "leporidae"],
    "pig":             ["pig", "minipig", "swine", "porcine"],
    "guinea pig":      ["guinea pig", "cavia"],
}

def scan_species_without_profile() -> list[Gap]:
    profiles_text = SCAN_CONFIG["species_profiles"].read_text(encoding="utf-8").lower()

    # Extract species from each validation YAML
    seen_species: dict[str, list[str]] = {}  # species -> [study_ids]
    for yaml_path in SCAN_CONFIG["validation_dir"].glob("*.yaml"):
        try:
            data = yaml.safe_load(yaml_path.read_text(encoding="utf-8"))
            sp = (data or {}).get("design", {}).get("species")
            if not sp:
                continue
            sp_norm = sp.strip().lower()
            seen_species.setdefault(sp_norm, []).append(yaml_path.stem)
        except Exception:
            continue

    gaps: list[Gap] = []
    for sp, study_ids in sorted(seen_species.items()):
        # Direct match
        if sp in profiles_text:
            continue
        # Synonym match (e.g. "primate" -> "monkey"/"cynomolgus")
        synonyms = SPECIES_SYNONYMS.get(sp, [])
        if any(syn in profiles_text for syn in synonyms):
            continue
        gaps.append(Gap(
            category="species-without-profile",
            item=sp,
            suggestion=(
                f"Add species section to species-profiles.md (exercised in {len(study_ids)} validation studies). "
                f"If a synonym is already covered, add to SPECIES_SYNONYMS in this script."
            ),
            evidence=f"validation studies: {', '.join(sorted(study_ids))}",
            safe=False,  # needs scientist input on biology
            severity="high" if len(study_ids) >= 2 else "medium",
        ))
    return gaps


# =============================================================================
# Scan 4 -- Research streams without ROADMAP entry (and vice versa)
# =============================================================================

def scan_research_roadmap_orphans() -> list[Gap]:
    registry = SCAN_CONFIG["research_registry"].read_text(encoding="utf-8")
    roadmap = SCAN_CONFIG["roadmap"].read_text(encoding="utf-8")

    # Extract research stream IDs (### headings under "## Active Streams")
    stream_re = re.compile(r"^###\s+([\w\-]+)\s*$", re.MULTILINE)
    streams = stream_re.findall(registry)

    gaps: list[Gap] = []
    for stream in streams:
        # Roadmap mentions can be: stream slug verbatim, or a research/<slug>.md file
        slug_variants = [
            stream,
            stream.replace("-", " "),
            stream.replace("-", "_"),
        ]
        if any(v.lower() in roadmap.lower() for v in slug_variants):
            continue
        gaps.append(Gap(
            category="research-orphan-from-roadmap",
            item=stream,
            suggestion="Either link to a ROADMAP epic or mark the stream as superseded/dormant",
            evidence=f"research/REGISTRY.md ### {stream} -- no ROADMAP mention",
            safe=True,
            severity="low",
        ))
    return gaps


# =============================================================================
# Scan 5 -- External citations in knowledge/ without a literature note
# =============================================================================

def scan_literature_gaps() -> list[Gap]:
    knowledge_dir = SCAN_CONFIG["knowledge_dir"]
    literature_dir = SCAN_CONFIG["literature_dir"]

    citation_patterns = [
        re.compile(r"\b(ICH\s+[A-Z]\d+(?:\(R\d+\))?)\b"),                  # ICH S5(R3)
        re.compile(r"\b(OECD\s+(?:TG\s+)?\d{3}(?:[A-Z]?))\b"),             # OECD 408
        re.compile(r"\b(FDA\s+Guidance(?:\s+[A-Z][\w\-]+)?)\b"),           # FDA Guidance ...
        re.compile(r"\b([A-Z][a-z]+\s+et\s+al\.?\s+\d{4})\b"),             # Smith et al. 2020
        re.compile(r"\b([A-Z][a-z]+(?:\s+&\s+[A-Z][a-z]+)?\s+\d{4})\b"),   # Smith & Jones 2020 / Smith 2020
    ]

    citations: dict[str, list[str]] = {}  # citation -> [files where seen]
    for md in knowledge_dir.glob("*.md"):
        text = md.read_text(encoding="utf-8")
        for pat in citation_patterns:
            for m in pat.finditer(text):
                cit = m.group(1).strip()
                citations.setdefault(cit, []).append(md.name)

    # Compare to existing literature notes
    if literature_dir.exists():
        lit_corpus = "\n".join(
            p.read_text(encoding="utf-8") for p in literature_dir.glob("*.md")
        ).lower()
    else:
        lit_corpus = ""

    gaps: list[Gap] = []
    # Limit to citations seen >=2 places (signal vs noise)
    for cit, files in sorted(citations.items()):
        if len(set(files)) < 2:
            continue
        if cit.lower() in lit_corpus:
            continue
        gaps.append(Gap(
            category="citation-without-literature-note",
            item=cit,
            suggestion=f"Write literature/<slug>.md for '{cit}' (cited in {len(set(files))} knowledge files)",
            evidence=f"knowledge/: {', '.join(sorted(set(files))[:4])}",
            safe=False,  # writing a literature note needs human reading of the source
            severity="medium" if len(set(files)) >= 3 else "low",
        ))
    return gaps


# =============================================================================
# Scan 6 -- Capability pillar gaps not tracked in TODO.md
# =============================================================================

def scan_capability_gaps_not_tracked() -> list[Gap]:
    cap_data = yaml.safe_load(SCAN_CONFIG["capabilities"].read_text(encoding="utf-8"))
    todo_text = SCAN_CONFIG["todo"].read_text(encoding="utf-8").lower()

    gaps_out: list[Gap] = []
    pillars = (cap_data or {}).get("pillars", {}) or {}
    for pillar_name, pillar in pillars.items():
        if not isinstance(pillar, dict):
            continue
        decisions = pillar.get("decisions", {}) or {}
        for decision_name, decision in decisions.items():
            if not isinstance(decision, dict):
                continue
            for gap_text in decision.get("gaps", []) or []:
                if not isinstance(gap_text, str):
                    continue
                # Heuristic: extract distinctive 3-word phrase, lowercase, find in TODO.
                tokens = re.findall(r"[a-z]{4,}", gap_text.lower())
                if len(tokens) < 3:
                    continue
                # Pick the rarest 2 tokens to match (avoid "user", "show", etc.)
                key_phrase = " ".join(tokens[:3])
                if key_phrase in todo_text:
                    continue
                # Try alternate phrase
                alt_phrase = " ".join(tokens[1:4]) if len(tokens) >= 4 else None
                if alt_phrase and alt_phrase in todo_text:
                    continue
                gaps_out.append(Gap(
                    category="capability-gap-not-in-todo",
                    item=f"{pillar_name} / {decision_name}: {gap_text[:80]}",
                    suggestion="Add to TODO.md or remove from capabilities.yaml if obsolete",
                    evidence=f"capabilities.yaml pillars.{pillar_name}.decisions.{decision_name}.gaps",
                    safe=True,
                    severity="medium",
                ))
    return gaps_out


# =============================================================================
# Driver
# =============================================================================

SCANS: list[tuple[str, Callable[[], list[Gap]]]] = [
    ("subsystem-missing-architecture",  scan_subsystems_missing_architecture),
    ("species-without-profile",         scan_species_without_profile),
    ("research-orphan-from-roadmap",    scan_research_roadmap_orphans),
    ("citation-without-literature-note", scan_literature_gaps),
    ("capability-gap-not-in-todo",      scan_capability_gaps_not_tracked),
]


def write_report(gaps: list[Gap], errors: list[tuple[str, str]]) -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    by_cat: dict[str, list[Gap]] = {}
    for g in gaps:
        by_cat.setdefault(g.category, []).append(g)

    lines: list[str] = []
    lines.append("# Discovery Scan Report")
    lines.append("")
    lines.append(f"_Generated: {datetime.now().isoformat(timespec='seconds')}_  ")
    lines.append(f"_Scans: {len(SCANS)} | gaps: {len(gaps)} | errors: {len(errors)}_")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append("| Category | Count | Safe-for-autopilot |")
    lines.append("|---|---|---|")
    for cat, items in sorted(by_cat.items(), key=lambda kv: -len(kv[1])):
        safe_count = sum(1 for g in items if g.safe)
        safe_label = (
            "Y (all)" if safe_count == len(items)
            else "N (none)" if safe_count == 0
            else f"partial ({safe_count}/{len(items)})"
        )
        lines.append(f"| {cat} | {len(items)} | {safe_label} |")
    lines.append("")

    if errors:
        lines.append("## Scan errors")
        lines.append("")
        for name, err in errors:
            lines.append(f"- **{name}**: {err}")
        lines.append("")

    lines.append("## Gaps by category")
    for cat, items in sorted(by_cat.items()):
        lines.append("")
        lines.append(f"### {cat} ({len(items)})")
        lines.append("")
        # Sort: high severity first, then unsafe last
        items.sort(key=lambda g: ({"high": 0, "medium": 1, "low": 2}[g.severity], not g.safe))
        lines.append("| Item | Suggestion | Evidence | Sev | Safe |")
        lines.append("|---|---|---|---|---|")
        for g in items:
            sev_label = {"high": "**high**", "medium": "med", "low": "low"}[g.severity]
            safe_label = "Y" if g.safe else "N"
            lines.append(f"| {g.item} | {g.suggestion} | {g.evidence} | {sev_label} | {safe_label} |")

    OUTPUT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    all_gaps: list[Gap] = []
    errors: list[tuple[str, str]] = []
    for name, fn in SCANS:
        try:
            results = fn()
            all_gaps.extend(results)
            print(f"[ok] {name}: {len(results)} gap(s)")
        except Exception as e:
            errors.append((name, f"{type(e).__name__}: {e}"))
            traceback.print_exc(file=sys.stderr)

    write_report(all_gaps, errors)
    print(f"\nReport written: {OUTPUT_PATH}")
    print(f"Total gaps: {len(all_gaps)}")
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
