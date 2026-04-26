"""Orchestrator: calls all findings modules, normalizes, classifies, assigns IDs, caches JSON."""

import json
import hashlib
from pathlib import Path

from config import CACHE_DIR
from services.study_discovery import StudyInfo
from services.analysis.dose_groups import build_dose_groups
from services.analysis.findings_lb import compute_lb_findings
from services.analysis.findings_bw import compute_bw_findings
from services.analysis.findings_om import compute_om_findings
from services.analysis.findings_mi import compute_mi_findings
from services.analysis.findings_ma import compute_ma_findings
from services.analysis.findings_tf import compute_tf_findings
from services.analysis.findings_cl import compute_cl_findings
from services.analysis.findings_ds import compute_ds_findings
from services.analysis.correlations import compute_correlations
from services.analysis.mortality import get_early_death_subjects
from services.analysis.phase_filter import get_terminal_subjects, compute_last_dosing_day
from services.analysis.override_reader import get_last_dosing_day_override
from services.analysis.findings_pipeline import (
    process_findings, build_findings_map,
)
from services.analysis.organ_thresholds import get_species
from services.analysis.hcd import get_strain, get_study_duration_days, get_route, get_vehicle


from services.analysis.sanitize import sanitize as _sanitize_floats


def _cache_path(study_id: str) -> Path:
    cache_dir = CACHE_DIR / study_id
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / "adverse_effects.json"


def _get_xpt_max_mtime(study: StudyInfo) -> float:
    """Get the most recent mtime across relevant XPT files."""
    relevant = ["dm", "tx", "lb", "bw", "om", "mi", "ma", "cl", "ds", "tf"]
    mtimes = []
    for domain in relevant:
        if domain in study.xpt_files:
            mtimes.append(study.xpt_files[domain].stat().st_mtime)
    return max(mtimes) if mtimes else 0


def _get_code_content_hash() -> str:
    """Content-hash of all Python files that affect compute_adverse_effects output.

    Hashes all .py files under services/analysis/ and generator/ — any code change
    in these directories invalidates the cache. This is broader than a manual dep list
    but eliminates the class of bugs where a new/renamed module isn't tracked.

    Explicitly excludes routers/, tests/, and services/study_discovery.py which
    affect request handling but not computation output. Unnecessary invalidation
    (editing an unrelated file in the glob) is safe — stale results are not.
    """
    analysis_dir = Path(__file__).parent
    generator_dir = analysis_dir.parent.parent / "generator"

    hasher = hashlib.md5()
    py_files = sorted([
        *analysis_dir.glob("**/*.py"),
        *generator_dir.glob("**/*.py"),
    ])
    for py_file in py_files:
        hasher.update(py_file.read_bytes())
    return hasher.hexdigest()


def _code_hash_path(study_id: str) -> Path:
    cache_dir = CACHE_DIR / study_id
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / "adverse_effects.code_hash"


def _is_cache_valid(study: StudyInfo) -> bool:
    """Check if cached JSON is newer than XPT files and code content is unchanged."""
    cp = _cache_path(study.study_id)
    hp = _code_hash_path(study.study_id)
    if not cp.exists() or not hp.exists():
        return False
    # Data freshness: cache newer than all XPT files
    cache_mtime = cp.stat().st_mtime
    data_fresh = cache_mtime > _get_xpt_max_mtime(study)
    # Code freshness: stored hash matches current code content
    stored_hash = hp.read_text().strip()
    code_fresh = stored_hash == _get_code_content_hash()
    return data_fresh and code_fresh


def compute_adverse_effects(study: StudyInfo) -> dict:
    """Compute or load cached adverse effects analysis.

    Returns full analysis dict with dose_groups, findings, correlations, summary.
    """
    # Check cache
    cp = _cache_path(study.study_id)
    if _is_cache_valid(study):
        with open(cp, "r", encoding="utf-8") as f:
            return json.load(f)

    # Compute
    print(f"Computing adverse effects for {study.study_id}...")

    # Step 1: Build dose groups
    dg_data = build_dose_groups(study)
    dose_groups = dg_data["dose_groups"]
    subjects = dg_data["subjects"]

    # Step 1b: Compute last dosing day for recovery animal treatment-period pooling
    override = get_last_dosing_day_override(study.study_id)
    last_dosing_day = compute_last_dosing_day(study, override=override)

    # Step 1c: Identify early-death subjects for dual-pass
    early_death_subjects = get_early_death_subjects(study, subjects)
    excluded_set = set(early_death_subjects.keys()) if early_death_subjects else None
    n_excluded = len(excluded_set) if excluded_set else 0

    # Step 2: Compute findings from each domain (pass 1 — all animals)
    # In-life domains receive last_dosing_day for recovery pooling;
    # terminal domains (MI, MA, OM, TF) and DS are main-study-only.
    all_findings = []
    all_findings.extend(compute_lb_findings(study, subjects, last_dosing_day=last_dosing_day))
    all_findings.extend(compute_bw_findings(study, subjects, last_dosing_day=last_dosing_day))
    all_findings.extend(compute_om_findings(study, subjects))
    mi_findings, mi_tissue = compute_mi_findings(study, subjects)
    ma_findings, ma_tissue = compute_ma_findings(study, subjects)
    all_findings.extend(mi_findings)
    all_findings.extend(ma_findings)
    mi_tissue_inventory = mi_tissue | ma_tissue
    all_findings.extend(compute_tf_findings(study, subjects))
    all_findings.extend(compute_cl_findings(study, subjects, last_dosing_day=last_dosing_day))
    all_findings.extend(compute_ds_findings(study, subjects))

    # Pass 2 — build scheduled-only map for terminal + LB domains
    scheduled_map = None
    if excluded_set:
        sched_findings = []
        mi_sched, _ = compute_mi_findings(study, subjects, excluded_subjects=excluded_set)
        ma_sched, _ = compute_ma_findings(study, subjects, excluded_subjects=excluded_set)
        sched_findings.extend(mi_sched)
        sched_findings.extend(ma_sched)
        sched_findings.extend(compute_om_findings(study, subjects, excluded_subjects=excluded_set))
        sched_findings.extend(compute_tf_findings(study, subjects, excluded_subjects=excluded_set))
        sched_findings.extend(compute_lb_findings(study, subjects, excluded_subjects=excluded_set))
        sched_findings.extend(compute_ds_findings(study, subjects, excluded_subjects=excluded_set))
        scheduled_map = build_findings_map(sched_findings, "scheduled")

    # Pass 3 — build separate (main-only) map for in-life domains
    separate_map = None
    has_recovery = subjects["is_recovery"].any()
    if has_recovery:
        main_only_subs = get_terminal_subjects(subjects)
        sep_findings = []
        sep_findings.extend(compute_bw_findings(study, main_only_subs))
        sep_findings.extend(compute_lb_findings(study, main_only_subs))
        sep_findings.extend(compute_cl_findings(study, main_only_subs))
        separate_map = build_findings_map(sep_findings, "separate")

    # Resolve study metadata for organ-specific thresholds and HCD
    species = get_species(study)
    strain = get_strain(study)
    duration_days = get_study_duration_days(study)
    route = get_route(study)
    vehicle = get_vehicle(study)

    # Resolve expected-effect profile for D9 scoring
    from services.analysis.compound_class import resolve_active_profile
    expected_profile = resolve_active_profile(
        study.study_id, ts_meta={"species": species, "strain": strain, "route": route},
        available_domains=set(study.xpt_files.keys()), species=species,
    )
    study_meta = {"species": species, "strain": strain}

    # Shared enrichment pipeline (classification, fold change, labels, etc.)
    all_findings = process_findings(
        all_findings, scheduled_map, separate_map, n_excluded,
        species=species, strain=strain, duration_days=duration_days,
        route=route, vehicle=vehicle,
        expected_profile=expected_profile, study_meta=study_meta,
    )

    # API-specific: assign deterministic IDs
    for finding in all_findings:
        specimen_part = finding.get("specimen") or ""
        id_str = f"{finding['domain']}_{finding['test_code']}_{specimen_part}_{finding.get('day', '')}_{finding['sex']}"
        finding["id"] = hashlib.md5(id_str.encode()).hexdigest()[:12]

    # Step 4: Correlations
    correlations = compute_correlations(all_findings)

    # Step 5: Summary
    severity_counts = {"adverse": 0, "warning": 0, "normal": 0}  # triangle-audit:exempt -- bucket initialization; not_assessed counted dynamically via .get() if encountered.
    target_organs = set()
    domains_with_findings = set()
    treatment_related_count = 0

    for f in all_findings:
        sev = f.get("severity", "normal")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
        if f.get("severity") != "normal":
            domains_with_findings.add(f["domain"])
        if f.get("treatment_related"):
            treatment_related_count += 1
            if f.get("specimen"):
                target_organs.add(f["specimen"])

    # Suggested NOAEL: highest dose where no adverse findings
    # Skip if no concurrent control — NOAEL requires a reference group
    has_concurrent_control = dg_data.get("has_concurrent_control", True)
    suggested_noael = None
    if not has_concurrent_control:
        suggested_noael = None  # explicitly indeterminate
    else:
        adverse_dose_levels = set()
        for f in all_findings:
            if f.get("severity") == "adverse":
                is_incidence = f.get("data_type") == "incidence"
                for pw in f.get("pairwise", []):
                    # gLower > 0.3 primary. Incidence: h_lower excluded (degenerate
                    # at N<=5), falls to p-value. See cohens-h-commensurability-analysis.md.
                    gl = pw.get("g_lower")
                    if gl is not None and gl > 0.3:
                        adverse_dose_levels.add(pw["dose_level"])
                        continue
                    if not is_incidence:
                        hl = pw.get("h_lower")
                        if hl is not None and hl > 0.3:
                            adverse_dose_levels.add(pw["dose_level"])
                            continue
                    # Fallback: p-value (primary for incidence; legacy for continuous)
                    if pw.get("p_value_adj") is not None and pw["p_value_adj"] < 0.05:
                        adverse_dose_levels.add(pw["dose_level"])

        if adverse_dose_levels:
            min_adverse = min(adverse_dose_levels)
            if min_adverse > 0:
                noael_level = min_adverse - 1
                noael_group = next((d for d in dose_groups if d["dose_level"] == noael_level), None)
                if noael_group:
                    suggested_noael = {
                        "dose_level": noael_level,
                        "label": noael_group["label"],
                        "dose_value": noael_group["dose_value"],
                        "dose_unit": noael_group["dose_unit"],
                    }

    summary = {
        "total_findings": len(all_findings),
        "total_adverse": severity_counts["adverse"],
        "total_warning": severity_counts["warning"],
        "total_normal": severity_counts["normal"],
        "total_treatment_related": treatment_related_count,
        "target_organs": sorted(target_organs),
        "domains_with_findings": sorted(domains_with_findings),
        "suggested_noael": suggested_noael,
    }

    result = _sanitize_floats({
        "study_id": study.study_id,
        "dose_groups": dose_groups,
        "findings": all_findings,
        "correlations": correlations,
        "summary": summary,
    })

    # Cache result + code content hash
    with open(cp, "w") as f:
        json.dump(result, f)
    _code_hash_path(study.study_id).write_text(_get_code_content_hash())
    print(f"Adverse effects cached: {len(all_findings)} findings, "
          f"{severity_counts['adverse']} adverse, {severity_counts['warning']} warning")

    return result
