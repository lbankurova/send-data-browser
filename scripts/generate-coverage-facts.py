"""
Generate coverage-facts.md from codebase introspection.

Reads actual data files, database, configs, and source files to produce
a machine-verified reference document for the user-facing coverage page.

Usage:
    cd C:/pg/pcc && backend/venv/Scripts/python.exe scripts/generate-coverage-facts.py
"""

import json
import os
import re
import sqlite3
import sys
from collections import defaultdict
from glob import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / "shared"
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
HCD_DB = BACKEND / "data" / "hcd.db"

out_lines: list[str] = []


def emit(line: str = ""):
    out_lines.append(line)


def heading(level: int, text: str):
    emit(f"\n{'#' * level} {text}\n")


# ── 1. Backend domain processors ─────────────────────────────────────

def audit_domain_processors():
    heading(2, "1. Backend domain processors")
    findings_dir = BACKEND / "services" / "analysis"
    processors = sorted(findings_dir.glob("findings_*.py"))

    emit("| File | Domain | Type | Statistical imports |")
    emit("|---|---|---|---|")

    for p in processors:
        if p.name == "findings_pipeline.py":
            continue
        domain = p.stem.replace("findings_", "").upper()
        text = p.read_text(encoding="utf-8", errors="replace")

        # detect data type from function patterns
        if "incidence" in text.lower() or "fisher" in text.lower() or "mantel" in text.lower():
            dtype = "incidence"
        elif "dunnett" in text.lower() or "mean" in text.lower():
            dtype = "continuous"
        else:
            dtype = "parser-only"

        # detect statistical methods imported/used
        stats = []
        if "dunnett" in text.lower():
            stats.append("Dunnett")
        if "welch" in text.lower():
            stats.append("Welch")
        if "boschloo" in text.lower() or "incidence_exact" in text.lower():
            stats.append("exact-test")
        if "fisher" in text.lower() and "incidence_exact" not in text.lower():
            stats.append("Fisher")
        if "trend_test" in text.lower() or "jonckheere" in text.lower():
            stats.append("JT-trend")
        if "mantel" in text.lower():
            stats.append("MH-trend")
        if "williams" in text.lower():
            stats.append("Williams")
        if "ancova" in text.lower() or "run_ancova" in text.lower():
            stats.append("ANCOVA")
        if "cohen" in text.lower() or "hedges" in text.lower() or "effect_size" in text.lower():
            stats.append("effect-size")
        if "odds_ratio" in text.lower() or "risk_ratio" in text.lower():
            stats.append("OR/RR")
        if "geometric" in text.lower() or "geom_mean" in text.lower() or "log10" in text.lower():
            stats.append("geometric-mean")

        emit(f"| {p.name} | {domain} | {dtype} | {', '.join(stats) if stats else 'none'} |")

    # Also check findings_pipeline.py for shared enrichment
    pipeline = findings_dir / "findings_pipeline.py"
    if pipeline.exists():
        text = pipeline.read_text(encoding="utf-8", errors="replace")
        shared_stats = []
        for kw, label in [
            ("dunnett", "Dunnett"), ("welch", "Welch"), ("incidence_exact", "exact-test"),
            ("trend_test", "JT-trend"), ("mantel", "MH-trend"), ("effect_size", "effect-size"),
            ("odds_ratio", "OR/RR"),
        ]:
            if kw in text.lower():
                shared_stats.append(label)
        emit(f"\n**Shared pipeline** (`findings_pipeline.py`): {', '.join(shared_stats) if shared_stats else 'none'}")


# ── 2. HCD database coverage ─────────────────────────────────────────

def audit_hcd_database():
    heading(2, "2. HCD database coverage")

    if not HCD_DB.exists():
        emit("**HCD database not found at expected path.**")
        return

    conn = sqlite3.connect(str(HCD_DB))
    cur = conn.cursor()

    # OM aggregates
    heading(3, "2a. Organ weight HCD (hcd_aggregates)")
    cur.execute("""
        SELECT sa.canonical AS strain, ha.sex, ha.organ, ha.duration_category, ha.n, ha.study_count
        FROM hcd_aggregates ha
        LEFT JOIN (SELECT DISTINCT canonical FROM strain_aliases) sa
            ON ha.strain = sa.canonical OR ha.strain IN (SELECT alias FROM strain_aliases WHERE canonical = sa.canonical)
        ORDER BY ha.strain, ha.organ, ha.sex, ha.duration_category
    """)
    # Simpler: just query hcd_aggregates directly
    cur.execute("""
        SELECT strain, sex, organ, duration_category, n, study_count
        FROM hcd_aggregates
        ORDER BY strain, organ, sex, duration_category
    """)
    rows = cur.fetchall()

    # Group by strain
    by_strain: dict[str, list] = defaultdict(list)
    for strain, sex, organ, dur, n, sc in rows:
        by_strain[strain].append((sex, organ, dur, n, sc))

    emit("| Strain | Organs | Durations | Aggregates | Total animals | Studies |")
    emit("|---|---|---|---|---|---|")
    for strain in sorted(by_strain.keys()):
        entries = by_strain[strain]
        organs = sorted(set(e[1] for e in entries))
        durations = sorted(set(e[2] for e in entries))
        total_n = sum(e[3] for e in entries)
        max_studies = max(e[4] for e in entries) if entries else 0
        emit(f"| {strain} | {len(organs)} ({', '.join(organs)}) | {', '.join(durations)} | {len(entries)} | {total_n:,} | {max_studies} |")

    # Individual animal record counts
    cur.execute("SELECT COUNT(*) FROM animal_organ_weights")
    total_animals = cur.fetchone()[0]
    emit(f"\n**Total individual animal records:** {total_animals:,}")

    # Strain aliases
    cur.execute("SELECT alias, canonical FROM strain_aliases ORDER BY canonical, alias")
    aliases = cur.fetchall()
    emit(f"\n**Strain aliases:** {len(aliases)} aliases -> {len(set(a[1] for a in aliases))} canonical strains")

    # LB aggregates
    heading(3, "2b. Clinical pathology HCD (hcd_lb_aggregates)")
    cur.execute("""
        SELECT species, strain, sex, test_code, duration_category, n, confidence, source
        FROM hcd_lb_aggregates
        ORDER BY species, strain, test_code, sex, duration_category
    """)
    lb_rows = cur.fetchall()

    by_species_strain: dict[str, list] = defaultdict(list)
    for species, strain, sex, tc, dur, n, conf, src in lb_rows:
        key = f"{species} / {strain}"
        by_species_strain[key].append((sex, tc, dur, n, conf, src))

    emit("| Species / Strain | Test codes | Durations | Aggregates | Confidence | Source |")
    emit("|---|---|---|---|---|---|")
    for key in sorted(by_species_strain.keys()):
        entries = by_species_strain[key]
        test_codes = sorted(set(e[1] for e in entries))
        durations = sorted(set(e[2] for e in entries))
        confidences = sorted(set(e[4] for e in entries if e[4]))
        sources = sorted(set(e[5] for e in entries if e[5]))
        emit(f"| {key} | {len(test_codes)} | {', '.join(durations)} | {len(entries)} | {', '.join(confidences)} | {'; '.join(sources)[:80]} |")

    emit(f"\n**Total LB aggregates:** {len(lb_rows)}")

    conn.close()


# ── 3. Expected-effect profiles ───────────────────────────────────────

def audit_compound_profiles():
    heading(2, "3. Expected-effect profiles")
    profile_dir = SHARED / "expected-effect-profiles"
    if not profile_dir.exists():
        emit("**Profile directory not found.**")
        return

    profiles = sorted(profile_dir.glob("*.json"))
    emit(f"**Total profiles:** {len(profiles)}\n")

    emit("| Profile ID | Display name | Modality | Base profiles | Expected findings | Domains covered |")
    emit("|---|---|---|---|---|---|")

    for pf in profiles:
        data = json.loads(pf.read_text(encoding="utf-8"))
        pid = data.get("profile_id", pf.stem)
        name = data.get("display_name", "")
        modality = data.get("modality", "")
        bases = data.get("base_profiles", [])
        findings = data.get("expected_findings", [])
        domains = sorted(set(f.get("domain", "?") for f in findings))
        xr = data.get("cross_reactivity_required", False)
        emit(f"| {pid} | {name} | {modality} | {', '.join(bases) if bases else '---'} | {len(findings)} | {', '.join(domains)} |")

    # Modality summary
    modalities: dict[str, int] = defaultdict(int)
    for pf in profiles:
        data = json.loads(pf.read_text(encoding="utf-8"))
        modalities[data.get("modality", "unknown")] += 1
    emit("\n**By modality:**")
    for mod, count in sorted(modalities.items()):
        emit(f"- {mod}: {count}")


# ── 4. Syndrome definitions ───────────────────────────────────────────

def audit_syndromes():
    heading(2, "4. Syndrome definitions")

    # Cross-domain syndromes
    sd_file = SHARED / "syndrome-definitions.json"
    if sd_file.exists():
        data = json.loads(sd_file.read_text(encoding="utf-8"))
        syndromes = data.get("syndromes", [])
        emit(f"### Cross-domain syndromes: {len(syndromes)}\n")
        emit("| ID | Name | Min domains | Required logic | Term count |")
        emit("|---|---|---|---|---|")
        for s in syndromes:
            sid = s.get("id", "?")
            name = s.get("name", "?")
            md = s.get("minDomains", "?")
            rl = s.get("requiredLogic", {}).get("type", "?")
            terms = len(s.get("terms", []))
            emit(f"| {sid} | {name} | {md} | {rl} | {terms} |")

    # Histopath syndromes
    hs_file = SHARED / "rules" / "histopath-syndromes.json"
    if hs_file.exists():
        data = json.loads(hs_file.read_text(encoding="utf-8"))
        rules = data.get("rules", [])
        emit(f"\n### Histopathology syndromes: {len(rules)}\n")
        emit("| ID | Name | Organ | Sex | Required findings | Supporting findings |")
        emit("|---|---|---|---|---|---|")
        for r in rules:
            sid = r.get("syndrome_id", "?")
            name = r.get("syndrome_name", "?")
            organ = ", ".join(r.get("organ", []))
            sex = r.get("sex", "any")
            req = len(r.get("required_findings", []))
            sup = len(r.get("supporting_findings", []))
            emit(f"| {sid} | {name} | {organ} | {sex} | {req} | {sup} |")


# ── 5. Study type configs ────────────────────────────────────────────

def audit_study_types():
    heading(2, "5. Study type configurations")
    st_dir = SHARED / "study-types"
    if not st_dir.exists():
        emit("**Study types directory not found.**")
        return

    configs = sorted(st_dir.glob("*.json"))
    emit(f"**Configured study types:** {len(configs)}\n")

    emit("| Config | Study type key | Available domains | Required domains | Time-course | Statistical mode |")
    emit("|---|---|---|---|---|---|")
    for cf in configs:
        data = json.loads(cf.read_text(encoding="utf-8"))
        key = data.get("study_type_key", cf.stem)
        avail = data.get("available_domains", [])
        req = data.get("required_domains", [])
        tc = data.get("time_course", "?")
        sm = data.get("statistical_mode", "?")
        emit(f"| {cf.name} | {key} | {', '.join(avail)} | {', '.join(req)} | {tc} | {sm} |")


# ── 6. Species overrides ─────────────────────────────────────────────

def audit_species_overrides():
    heading(2, "6. Species overrides")
    so_file = SHARED / "species-overrides.json"
    if not so_file.exists():
        emit("**Species overrides file not found.**")
        return

    data = json.loads(so_file.read_text(encoding="utf-8"))

    # Structure: { "_doc": ..., "overrides": { "rat": { "XS01": ... }, "rabbit": ... } }
    overrides = data.get("overrides", data)
    if isinstance(overrides, dict):
        meta_keys = {k for k in overrides if k.startswith("_")}
        species_keys = sorted(k for k in overrides if k not in meta_keys)

        emit(f"**Species with overrides:** {len(species_keys)}\n")
        emit("| Species | Syndromes overridden | Notes |")
        emit("|---|---|---|")

        for sp in species_keys:
            sp_data = overrides[sp]
            notes = sp_data.get("_notes", "")
            syndrome_keys = sorted(k for k in sp_data if not k.startswith("_"))
            emit(f"| {sp} | {', '.join(syndrome_keys)} ({len(syndrome_keys)}) | {notes} |")


# ── 7. Adversity dictionary ──────────────────────────────────────────

def audit_adversity_dictionary():
    heading(2, "7. Adversity dictionary")
    ad_file = SHARED / "adversity-dictionary.json"
    if not ad_file.exists():
        emit("**Adversity dictionary not found.**")
        return

    data = json.loads(ad_file.read_text(encoding="utf-8"))
    emit("| Category | Terms |")
    emit("|---|---|")
    for cat in ["always_adverse", "likely_adverse", "context_dependent"]:
        terms = data.get(cat, [])
        emit(f"| {cat} | {', '.join(terms)} ({len(terms)}) |")


# ── 8. Organ-sex concordance bands ───────────────────────────────────

def audit_sex_concordance():
    heading(2, "8. Organ-sex concordance bands")
    sc_file = SHARED / "organ-sex-concordance-bands.json"
    if not sc_file.exists():
        emit("**Concordance bands file not found.**")
        return

    data = json.loads(sc_file.read_text(encoding="utf-8"))
    meta_keys = {k for k in data if k.startswith("_") or k == "default"}
    species_keys = sorted(k for k in data if k not in meta_keys)

    for sp in species_keys:
        bands = data[sp]
        organs = sorted(k for k in bands if bands[k] is not None)
        null_organs = sorted(k for k in bands if bands[k] is None)
        emit(f"**{sp}:** {len(organs)} scored organs, {len(null_organs)} excluded ({', '.join(null_organs)})")

    if "default" in data:
        d = data["default"]
        emit(f"**Default fallback:** concordance={d.get('concordance')}, divergence={d.get('divergence')}")


# ── 9. Recovery duration table ────────────────────────────────────────

def audit_recovery_table():
    heading(2, "9. Recovery duration table")
    rt_file = FRONTEND / "src" / "lib" / "recovery-duration-table.ts"
    if not rt_file.exists():
        emit("**Recovery duration table not found.**")
        return

    text = rt_file.read_text(encoding="utf-8")

    # ── Parse RECOVERY_TABLE (histopath) ──
    # Structure: const RECOVERY_TABLE: Record<string, OrganTable> = { LIVER: { finding: {...}, ... }, ... }
    # Organs are uppercase keys like "LIVER:", findings are lowercase keys like "hypertrophy_hepatocellular:"
    table_start = text.find("const RECOVERY_TABLE")
    cont_start = text.find("export const CONTINUOUS_RECOVERY")
    if table_start == -1:
        emit("Could not find RECOVERY_TABLE definition")
        return

    histopath_section = text[table_start:cont_start] if cont_start != -1 else text[table_start:]

    # Find organ keys: lines like "  LIVER: {"
    organs: list[str] = []
    findings_per_organ: dict[str, int] = {}
    current_organ = None

    for line in histopath_section.split("\n"):
        # Organ key: 2-space indent, ALL_CAPS, colon, open brace
        m_organ = re.match(r"^  ([A-Z][A-Z_]+):\s*\{", line)
        if m_organ:
            if current_organ:
                findings_per_organ[current_organ] = findings_per_organ.get(current_organ, 0)
            current_organ = m_organ.group(1)
            organs.append(current_organ)
            findings_per_organ[current_organ] = 0
            continue
        # Finding key: 4-space indent, lowercase_with_underscores, colon
        m_finding = re.match(r"^    ([a-z][a-z0-9_]+):\s+", line)
        if m_finding and current_organ:
            findings_per_organ[current_organ] += 1

    emit(f"**Organs:** {len(organs)}\n")
    emit("| Organ | Histopathology finding types |")
    emit("|---|---|")
    total = 0
    for organ in organs:
        fc = findings_per_organ.get(organ, 0)
        total += fc
        emit(f"| {organ} | {fc} |")
    emit(f"\n**Total histopathology finding types:** {total}")

    # ── Parse CONTINUOUS_RECOVERY ──
    if cont_start != -1:
        cont_section = text[cont_start:]
        categories: list[str] = []
        endpoints_per_cat: dict[str, int] = {}
        current_cat = None

        for line in cont_section.split("\n"):
            m_cat = re.match(r'^  ([A-Z][A-Z_]+):\s*\{', line)
            if m_cat:
                if current_cat:
                    endpoints_per_cat[current_cat] = endpoints_per_cat.get(current_cat, 0)
                current_cat = m_cat.group(1)
                categories.append(current_cat)
                endpoints_per_cat[current_cat] = 0
                continue
            m_ep = re.match(r'^    ([a-z][a-z0-9_]+):\s+', line)
            if m_ep and current_cat:
                endpoints_per_cat[current_cat] += 1

        cont_total = sum(endpoints_per_cat.values())
        emit(f"\n**Continuous endpoint categories:** {len(categories)}")
        emit("| Category | Endpoints |")
        emit("|---|---|")
        for cat in categories:
            emit(f"| {cat} | {endpoints_per_cat.get(cat, 0)} |")
        emit(f"\n**Total continuous endpoints:** {cont_total}")


# ── 10. Statistical method files ──────────────────────────────────────

def audit_statistics():
    heading(2, "10. Statistical method implementations")
    stats_dir = BACKEND / "services" / "analysis"

    # Backend implementation files
    files_to_check = {
        "statistics.py": ["dunnett", "welch", "boschloo", "fisher", "incidence_exact", "trend_test", "mann_whitney", "cohen", "hedges", "odds_ratio", "risk_ratio", "bonferroni", "cochran"],
        "williams.py": ["williams", "pava"],
        "ancova.py": ["ancova", "ols"],
    }

    for fname, keywords in files_to_check.items():
        fpath = stats_dir / fname
        if not fpath.exists():
            emit(f"**{fname}:** NOT FOUND")
            continue
        text = fpath.read_text(encoding="utf-8", errors="replace")

        funcs = re.findall(r'^def\s+(\w+)\s*\(', text, re.MULTILINE)
        public_funcs = [f for f in funcs if not f.startswith("_")]
        emit(f"**{fname}:** public functions: {', '.join(public_funcs)}")

    # Configurable analysis settings (user-selectable methods)
    heading(3, "10a. User-configurable method settings")
    settings_file = stats_dir / "analysis_settings.py"
    if settings_file.exists():
        text = settings_file.read_text(encoding="utf-8", errors="replace")
        # Extract Literal type choices for each setting
        literal_matches = re.findall(
            r'(\w+):\s*Literal\[([^\]]+)\]\s*=\s*["\']?([^"\'"\n,]+)',
            text
        )
        # Deduplicate by setting name
        seen_settings: set[str] = set()
        emit("| Setting | Options | Default |")
        emit("|---|---|---|")
        for name, options, default in literal_matches:
            if name in seen_settings:
                continue
            seen_settings.add(name)
            opts = [o.strip().strip('"').strip("'") for o in options.split(",")]
            emit(f"| {name} | {', '.join(opts)} | {default.strip()} |")

    # Frontend method registry
    heading(3, "10b. Frontend method registry")
    registry_file = FRONTEND / "src" / "lib" / "method-registry.ts"
    if registry_file.exists():
        text = registry_file.read_text(encoding="utf-8")
        # Extract registered methods
        ids = re.findall(r'id:\s*"([^"]+)"', text)
        names = re.findall(r'name:\s*"([^"]+)"', text)
        categories = re.findall(r'category:\s*"([^"]+)"', text)
        emit("| ID | Name | Category |")
        emit("|---|---|---|")
        for i in range(min(len(ids), len(names), len(categories))):
            emit(f"| {ids[i]} | {names[i]} | {categories[i]} |")


# ── 11. Frontend components ───────────────────────────────────────────

def audit_frontend():
    heading(2, "11. Frontend analysis components")

    # Key directories
    analysis_dir = FRONTEND / "src" / "components" / "analysis"
    findings_dir = analysis_dir / "findings"
    noael_dir = analysis_dir / "noael"
    panes_dir = analysis_dir / "panes"
    charts_dir = analysis_dir / "charts"
    lib_dir = FRONTEND / "src" / "lib"

    for label, d in [("analysis/", analysis_dir), ("analysis/findings/", findings_dir),
                      ("analysis/noael/", noael_dir), ("analysis/panes/", panes_dir),
                      ("analysis/charts/", charts_dir)]:
        if d.exists():
            tsx_files = sorted(d.glob("*.tsx"))
            ts_files = sorted(d.glob("*.ts"))
            all_files = sorted(set(tsx_files + ts_files))
            emit(f"**{label}** ({len(all_files)} files): {', '.join(f.name for f in all_files)}")
        else:
            emit(f"**{label}** NOT FOUND")

    # Key lib files
    heading(3, "Key lib files")
    key_libs = [
        "report-generator.ts",
        "cross-domain-syndromes.ts",
        "syndrome-rules.ts",
        "recovery-verdict.ts",
        "recovery-duration-table.ts",
        "noael-narrative.ts",
        "organ-sex-concordance.ts",
        "cross-study-engine.ts",
        "severity-colors.ts",
    ]
    for name in key_libs:
        fpath = lib_dir / name
        if fpath.exists():
            size = fpath.stat().st_size
            lines = len(fpath.read_text(encoding="utf-8").split("\n"))
            emit(f"- {name}: {lines} lines")
        else:
            emit(f"- {name}: NOT FOUND")


# ── 12. Override system ───────────────────────────────────────────────

def audit_overrides():
    heading(2, "12. Override system")
    or_file = BACKEND / "services" / "analysis" / "override_reader.py"
    if not or_file.exists():
        emit("**Override reader not found.**")
        return

    text = or_file.read_text(encoding="utf-8", errors="replace")
    funcs = re.findall(r'^def\s+(\w+)\s*\(', text, re.MULTILINE)
    public_funcs = [f for f in funcs if not f.startswith("_")]
    emit(f"**Public functions:** {', '.join(public_funcs)}")

    # Check what override file types are referenced
    json_refs = re.findall(r'["\'](\w+\.json)["\']', text)
    emit(f"**Override files read:** {', '.join(sorted(set(json_refs)))}")


# ── 13. HCD reference ranges (JSON fallback) ─────────────────────────

def audit_hcd_json():
    heading(2, "13. HCD reference ranges (JSON fallback)")
    hcd_file = SHARED / "hcd-reference-ranges.json"
    if not hcd_file.exists():
        emit("**HCD reference ranges JSON not found.**")
        return

    data = json.loads(hcd_file.read_text(encoding="utf-8"))

    if isinstance(data, dict):
        # Determine structure
        meta_keys = [k for k in data if k.startswith("_")]
        for mk in meta_keys:
            emit(f"**{mk}:** {data[mk]}")

        data_keys = [k for k in data if not k.startswith("_")]
        emit(f"\n**Top-level keys:** {', '.join(data_keys[:10])}")

        # Try to count entries
        total_entries = 0
        for k in data_keys:
            v = data[k]
            if isinstance(v, list):
                total_entries += len(v)
            elif isinstance(v, dict):
                total_entries += len(v)
        emit(f"**Entries:** {total_entries}")


# ── 14. Classification pipeline ───────────────────────────────────────

def audit_classification():
    heading(2, "14. Finding classification pipeline")
    cl_file = BACKEND / "services" / "analysis" / "classification.py"
    if not cl_file.exists():
        emit("**classification.py not found.**")
        return

    text = cl_file.read_text(encoding="utf-8", errors="replace")
    funcs = re.findall(r'^def\s+(\w+)\s*\(', text, re.MULTILINE)
    public_funcs = [f for f in funcs if not f.startswith("_")]
    emit(f"**Public functions:** {', '.join(public_funcs)}")
    emit(f"**Lines:** {len(text.split(chr(10)))}")

    # Check for finding classes returned by assess functions
    finding_classes = re.findall(r'return\s+"(\w+)"', text)
    valid_classes = {"not_treatment_related", "tr_non_adverse", "tr_adaptive", "tr_adverse", "equivocal"}
    found_classes = sorted(set(fc for fc in finding_classes if fc in valid_classes))
    emit(f"**Finding classes:** {', '.join(found_classes)}")

    # Count occurrences of each class
    for fc in found_classes:
        count = text.count(f'"{fc}"')
        emit(f"  - {fc}: {count} references")


# ── 15. Validation engine ─────────────────────────────────────────────

def audit_validation():
    heading(2, "15. Validation engine")
    val_dir = BACKEND / "validation"
    if not val_dir.exists():
        emit("**Validation directory not found.**")
        return

    # Count rule files
    rule_files = sorted(val_dir.rglob("*.yaml")) + sorted(val_dir.rglob("*.yml"))
    emit(f"**Rule files:** {len(rule_files)}")
    for rf in rule_files:
        emit(f"- {rf.relative_to(val_dir)}")

    # Check engine.py
    engine = val_dir / "engine.py"
    if engine.exists():
        text = engine.read_text(encoding="utf-8", errors="replace")
        # Look for standard_version
        versions = re.findall(r'standard_version\s*=\s*["\']([^"\']+)["\']', text)
        emit(f"**Standard version(s):** {', '.join(versions)}")

    # Check core_runner for SENDIG version detection
    core = val_dir / "core_runner.py"
    if core.exists():
        text = core.read_text(encoding="utf-8", errors="replace")
        sendig_versions = re.findall(r'["\'](\d-\d)["\']', text)
        emit(f"**CORE SENDIG versions:** {', '.join(sorted(set(sendig_versions)))}")


def audit_validation_rules():
    heading(2, "15b. Validation rule inventory")
    rules_dir = BACKEND / "validation" / "rules"
    if not rules_dir.exists():
        emit("**No rules directory found.**")
        return

    for yaml_file in sorted(rules_dir.glob("*.yaml")):
        data = __import__("yaml", fromlist=["safe_load"]).safe_load(
            yaml_file.read_text(encoding="utf-8")
        )
        rules = data.get("rules", [])
        emit(f"\n**{yaml_file.name}:** {len(rules)} rules\n")
        emit("| ID | Name | Severity | Category | Domains |")
        emit("|---|---|---|---|---|")
        for r in rules:
            rid = r.get("id", "?")
            name = r.get("name", "?")
            sev = r.get("severity", "?")
            cat = r.get("category", "?")
            doms = ", ".join(r.get("applicable_domains", []))
            emit(f"| {rid} | {name} | {sev} | {cat} | {doms} |")

    # Check modules
    checks_dir = BACKEND / "validation" / "checks"
    if checks_dir.exists():
        check_files = sorted(checks_dir.glob("*.py"))
        check_files = [f for f in check_files if f.name != "__init__.py"]
        emit(f"\n**Check modules:** {len(check_files)}")
        for cf in check_files:
            text = cf.read_text(encoding="utf-8", errors="replace")
            funcs = re.findall(r'^def\s+(check_\w+)\s*\(', text, re.MULTILINE)
            emit(f"- {cf.name}: {', '.join(funcs)}")


# ── 16. PK integration ───────────────────────────────────────────────

def audit_pk():
    heading(2, "16. PK/TK integration")
    pk_file = BACKEND / "generator" / "pk_integration.py"
    if not pk_file.exists():
        # Try alternative paths
        for alt in [BACKEND / "services" / "analysis" / "pk_integration.py",
                    BACKEND / "services" / "pk_integration.py"]:
            if alt.exists():
                pk_file = alt
                break
        else:
            emit("**pk_integration.py not found.**")
            return

    text = pk_file.read_text(encoding="utf-8", errors="replace")
    funcs = re.findall(r'^def\s+(\w+)\s*\(', text, re.MULTILINE)
    public_funcs = [f for f in funcs if not f.startswith("_")]
    emit(f"**File:** {pk_file.relative_to(ROOT)}")
    emit(f"**Public functions:** {', '.join(public_funcs)}")
    emit(f"**Lines:** {len(text.split(chr(10)))}")

    # Check for PK parameters
    params = re.findall(r'["\']([A-Z]{2,}(?:LST|TAU)?)["\']', text)
    pk_params = [p for p in set(params) if p in {"CMAX", "AUCLST", "AUCTAU", "TMAX", "TLST", "TLAG", "THALF", "CL", "VD", "MRT"}]
    emit(f"**PK parameters extracted:** {', '.join(sorted(pk_params))}")


# ── 17. Food consumption ─────────────────────────────────────────────

def audit_food_consumption():
    heading(2, "17. Food/water consumption analysis")

    # Check FW in domain_stats or findings
    fw_utils = BACKEND / "services" / "analysis" / "fw_utils.py"
    if fw_utils.exists():
        text = fw_utils.read_text(encoding="utf-8", errors="replace")
        funcs = re.findall(r'^def\s+(\w+)\s*\(', text, re.MULTILINE)
        emit(f"**fw_utils.py functions:** {', '.join(funcs)}")

    fc_summary = BACKEND / "services" / "analysis" / "food_consumption_summary.py"
    if not fc_summary.exists():
        fc_summary = BACKEND / "generator" / "food_consumption_summary.py"
    if fc_summary.exists():
        text = fc_summary.read_text(encoding="utf-8", errors="replace")
        funcs = re.findall(r'^def\s+(\w+)\s*\(', text, re.MULTILINE)
        emit(f"**food_consumption_summary.py functions:** {', '.join(funcs)}")
        # Check for FE ratio
        if "fe" in text.lower() or "food_efficiency" in text.lower() or "efficiency" in text.lower():
            emit("**Food efficiency ratio:** YES")
        else:
            emit("**Food efficiency ratio:** NOT DETECTED")


# ── 18. Report generator ─────────────────────────────────────────────

def audit_report_generator():
    heading(2, "18. Report generator")
    rg_file = FRONTEND / "src" / "lib" / "report-generator.ts"
    if not rg_file.exists():
        emit("**report-generator.ts not found.**")
        return

    text = rg_file.read_text(encoding="utf-8")
    lines = len(text.split("\n"))
    emit(f"**Lines:** {lines}")

    # Extract section headings from generated HTML template literals
    # Look for numbered sections like "1. Study Information"
    numbered = re.findall(r'(\d+\.\s+[A-Z][^"<`$]+)', text)
    lettered = re.findall(r'([A-C]\.\s+[A-Z][^"<`$]+)', text)
    sections = [s.strip().rstrip("'\"") for s in numbered + lettered]
    # Deduplicate
    seen_sections: set[str] = set()
    unique: list[str] = []
    for s in sections:
        if s not in seen_sections:
            seen_sections.add(s)
            unique.append(s)
    if unique:
        emit("**Report sections:**")
        for s in unique:
            emit(f"  - {s}")

    # Check for export formats
    if "pdf" in text.lower():
        emit("**PDF export:** referenced")
    else:
        emit("**PDF export:** not present")
    if "download" in text.lower() or "blob" in text.lower():
        emit("**Download mechanism:** referenced")
    else:
        emit("**Download mechanism:** not present")


# ── Main ──────────────────────────────────────────────────────────────

def build_coverage_manifest() -> dict:
    """Build a machine-readable coverage manifest from codebase introspection.

    Returns a dict with per-axis coverage state that can be diffed across commits.
    """
    manifest: dict = {"_generated": "", "_commit": ""}

    # Timestamp
    from datetime import datetime, timezone
    manifest["_generated"] = datetime.now(timezone.utc).isoformat()

    # Git commit
    try:
        import subprocess
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, cwd=str(ROOT)
        )
        manifest["_commit"] = result.stdout.strip()
    except Exception:
        manifest["_commit"] = "unknown"

    # ── Species coverage ──
    species_manifest: dict = {}
    hcd_db_path = BACKEND / "data" / "hcd.db"
    om_strains: dict[str, list[str]] = {}
    lb_species: dict[str, list[str]] = {}

    if hcd_db_path.exists():
        conn = sqlite3.connect(str(hcd_db_path))
        cur = conn.cursor()

        # OM HCD by strain
        cur.execute("SELECT DISTINCT strain FROM hcd_aggregates")
        for (strain,) in cur.fetchall():
            # Map strain to species
            s_upper = strain.upper()
            if any(k in s_upper for k in ["SPRAGUE", "FISCHER", "F344", "WISTAR", "LEWIS", "LONG"]):
                sp = "rat"
            elif any(k in s_upper for k in ["CD-1", "C57", "B6C3", "FVB", "BALB"]):
                sp = "mouse"
            elif any(k in s_upper for k in ["BEAGLE", "DOG"]):
                sp = "dog"
            elif any(k in s_upper for k in ["CYNO", "MACAQ"]):
                sp = "nhp"
            elif any(k in s_upper for k in ["NZW", "RABBIT"]):
                sp = "rabbit"
            else:
                sp = "unknown"
            om_strains.setdefault(sp, []).append(strain)

        # LB HCD by species
        cur.execute("SELECT DISTINCT species, strain FROM hcd_lb_aggregates")
        for (species, strain) in cur.fetchall():
            s_upper = (species or "").upper()
            if "RAT" in s_upper:
                sp = "rat"
            elif "DOG" in s_upper or "BEAGLE" in s_upper:
                sp = "dog"
            elif "MONKEY" in s_upper or "CYNO" in s_upper or "PRIMATE" in s_upper:
                sp = "nhp"
            elif "RABBIT" in s_upper:
                sp = "rabbit"
            elif "MOUSE" in s_upper or "MICE" in s_upper:
                sp = "mouse"
            else:
                sp = "unknown"
            lb_species.setdefault(sp, []).append(strain or species)

        conn.close()

    # Species overrides
    so_file = SHARED / "species-overrides.json"
    species_with_overrides: set[str] = set()
    if so_file.exists():
        so_data = json.loads(so_file.read_text(encoding="utf-8"))
        overrides = so_data.get("overrides", so_data)
        species_with_overrides = {k for k in overrides if not k.startswith("_") and overrides[k]}

    # Organ weight thresholds -- migrated to FCT registry (species-magnitude-thresholds-dog-nhp Phase A).
    # The FCT registry groups per-species bands under entries[*].bands[*].
    ot_file = SHARED / "rules" / "field-consensus-thresholds.json"
    species_with_thresholds: set[str] = set()
    if ot_file.exists():
        ot_data = json.loads(ot_file.read_text(encoding="utf-8"))
        for entry_key, entry in (ot_data.get("entries") or {}).items():
            if not entry_key.startswith("OM."):
                continue
            bands = entry.get("bands") if isinstance(entry, dict) else None
            if isinstance(bands, dict):
                for species_key, band in bands.items():
                    if species_key in {"any", "other"}:
                        continue
                    # Only count species whose band has at least one populated threshold.
                    if isinstance(band, dict) and any(
                        band.get(k) is not None
                        for k in ("variation_ceiling", "concern_floor", "adverse_floor", "strong_adverse_floor")
                    ):
                        species_with_thresholds.add(species_key)

    # Validation studies by species
    val_dir = ROOT / "docs" / "validation" / "references"
    species_validation: dict[str, list[str]] = {}
    if val_dir.exists():
        try:
            import yaml as _yaml
        except ImportError:
            _yaml = None
        if _yaml:
            for yf in sorted(val_dir.glob("*.yaml")):
                try:
                    ydata = _yaml.safe_load(yf.read_text(encoding="utf-8"))
                    sp_val = (ydata.get("design", {}).get("species", "") or "").upper()
                    if "RAT" in sp_val:
                        sp = "rat"
                    elif "DOG" in sp_val or "BEAGLE" in sp_val:
                        sp = "dog"
                    elif "MONKEY" in sp_val or "PRIMATE" in sp_val:
                        sp = "nhp"
                    elif "RABBIT" in sp_val:
                        sp = "rabbit"
                    elif "MOUSE" in sp_val:
                        sp = "mouse"
                    else:
                        sp = "other"
                    species_validation.setdefault(sp, []).append(yf.stem)
                except Exception:
                    pass

    for sp in ["rat", "dog", "nhp", "mouse", "rabbit", "guinea_pig", "minipig"]:
        species_manifest[sp] = {
            "hcd_organ_weight": sorted(om_strains.get(sp, [])),
            "hcd_clinical_path": sorted(set(lb_species.get(sp, []))),
            "has_overrides": sp.replace("_", " ") in species_with_overrides or sp in species_with_overrides,
            "has_magnitude_thresholds": sp in species_with_thresholds or sp == "rat",
            "validation_studies": sorted(species_validation.get(sp, [])),
        }

    manifest["species"] = species_manifest

    # ── Study types ──
    st_dir = SHARED / "study-types"
    study_types: dict[str, dict] = {}
    if st_dir.exists():
        for cf in sorted(st_dir.glob("*.json")):
            data = json.loads(cf.read_text(encoding="utf-8"))
            key = data.get("study_type_key", cf.stem)
            study_types[key] = {
                "config_file": cf.name,
                "available_domains": data.get("available_domains", []),
                "statistical_mode": data.get("statistical_mode", ""),
                "classification_framework": data.get("classification_framework", "ecetoc"),
            }
    manifest["study_types"] = study_types

    # ── Endpoint coverage ──
    findings_dir = BACKEND / "services" / "analysis"
    domain_modules: list[str] = []
    for p in sorted(findings_dir.glob("findings_*.py")):
        if p.name != "findings_pipeline.py":
            domain_modules.append(p.stem.replace("findings_", "").upper())
    manifest["endpoint_coverage"] = {
        "domain_modules": domain_modules,
        "domain_count": len(domain_modules),
    }

    # Syndrome count
    sd_file = SHARED / "syndrome-definitions.json"
    if sd_file.exists():
        sd_data = json.loads(sd_file.read_text(encoding="utf-8"))
        manifest["endpoint_coverage"]["syndrome_count"] = len(sd_data.get("syndromes", []))

    # ── Statistical methods ──
    stats_file = findings_dir / "statistics.py"
    stat_functions: list[str] = []
    if stats_file.exists():
        text = stats_file.read_text(encoding="utf-8", errors="replace")
        stat_functions = re.findall(r'^def\s+(\w+)\s*\(', text, re.MULTILINE)
        stat_functions = [f for f in stat_functions if not f.startswith("_")]
    manifest["statistical_methods"] = {
        "functions": stat_functions,
        "williams": (findings_dir / "williams.py").exists(),
        "ancova": (findings_dir / "ancova.py").exists(),
    }

    # ── Compound profiles ──
    profile_dir = SHARED / "expected-effect-profiles"
    profiles: list[str] = []
    if profile_dir.exists():
        profiles = [p.stem for p in sorted(profile_dir.glob("*.json"))]
    manifest["compound_profiles"] = {
        "count": len(profiles),
        "profiles": profiles,
    }

    # ── Validation ──
    val_ref_dir = ROOT / "docs" / "validation" / "references"
    val_studies: list[str] = []
    if val_ref_dir.exists():
        val_studies = [f.stem for f in sorted(val_ref_dir.glob("*.yaml"))]
    manifest["validation"] = {
        "study_count": len(val_studies),
        "studies": val_studies,
    }

    return manifest


def main():
    emit("# SENDEX Coverage Facts")
    emit(f"*Auto-generated from codebase introspection. Do not edit manually.*\n")

    audit_domain_processors()
    audit_hcd_database()
    audit_compound_profiles()
    audit_syndromes()
    audit_study_types()
    audit_species_overrides()
    audit_adversity_dictionary()
    audit_sex_concordance()
    audit_recovery_table()
    audit_statistics()
    audit_frontend()
    audit_overrides()
    audit_hcd_json()
    audit_classification()
    audit_validation()
    audit_validation_rules()
    audit_pk()
    audit_food_consumption()
    audit_report_generator()

    output = "\n".join(out_lines)

    # Write markdown to docs/_internal/help/
    out_path = ROOT / "docs" / "_internal" / "help" / "coverage-facts.md"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(output, encoding="utf-8")
    print(f"Written to {out_path}")
    print(f"({len(out_lines)} lines)")

    # Build and write JSON manifest
    manifest = build_coverage_manifest()
    manifest_path = ROOT / "docs" / "_internal" / "help" / "coverage-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Written to {manifest_path}")
    print(f"({len(manifest)} top-level keys)")


if __name__ == "__main__":
    main()
