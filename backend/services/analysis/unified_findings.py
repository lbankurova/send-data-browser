"""Orchestrator: calls all findings modules, normalizes, classifies, assigns IDs, caches JSON."""

import json
import hashlib
import math
from pathlib import Path

import numpy as np

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
from services.analysis.classification import (
    classify_severity, classify_dose_response, determine_treatment_related,
    compute_max_fold_change,
)
from services.analysis.correlations import compute_correlations
from services.analysis.mortality import get_early_death_subjects
from services.analysis.phase_filter import get_terminal_subjects, IN_LIFE_DOMAINS
from generator.organ_map import get_organ_system

TERMINAL_DOMAINS = {"MI", "MA", "OM", "TF"}
LB_DOMAIN = "LB"


def _sanitize_floats(obj):
    """Replace NaN/Inf float values with None, convert numpy scalars to Python types."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        val = float(obj)
        return None if (math.isnan(val) or math.isinf(val)) else val
    if isinstance(obj, np.ndarray):
        return _sanitize_floats(obj.tolist())
    if isinstance(obj, dict):
        return {k: _sanitize_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_floats(v) for v in obj]
    return obj


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


def _get_code_max_mtime() -> float:
    """Get the most recent mtime across files that affect compute_adverse_effects output.

    Explicit list — only files that are transitively imported by the computation.
    Editing unrelated files (insights.py, provenance.py, subject_context.py, etc.)
    no longer invalidates the cache.
    """
    analysis_dir = Path(__file__).parent
    generator_dir = analysis_dir.parent.parent / "generator"

    _CACHE_DEPS = [
        analysis_dir / "unified_findings.py",
        analysis_dir / "dose_groups.py",
        analysis_dir / "findings_lb.py",
        analysis_dir / "findings_bw.py",
        analysis_dir / "findings_om.py",
        analysis_dir / "findings_mi.py",
        analysis_dir / "findings_ma.py",
        analysis_dir / "findings_tf.py",
        analysis_dir / "findings_cl.py",
        analysis_dir / "classification.py",
        analysis_dir / "correlations.py",
        analysis_dir / "mortality.py",
        analysis_dir / "statistics.py",
        analysis_dir / "supp_qualifiers.py",
        analysis_dir / "phase_filter.py",
        analysis_dir / "normalization.py",
        analysis_dir / "williams.py",
        generator_dir / "organ_map.py",
    ]

    mtimes = [f.stat().st_mtime for f in _CACHE_DEPS if f.exists()]
    return max(mtimes) if mtimes else 0


def _is_cache_valid(study: StudyInfo) -> bool:
    """Check if cached JSON is newer than all relevant XPT files and code."""
    cp = _cache_path(study.study_id)
    if not cp.exists():
        return False
    cache_mtime = cp.stat().st_mtime
    data_fresh = cache_mtime > _get_xpt_max_mtime(study)
    code_fresh = cache_mtime > _get_code_max_mtime()
    return data_fresh and code_fresh


def compute_adverse_effects(study: StudyInfo) -> dict:
    """Compute or load cached adverse effects analysis.

    Returns full analysis dict with dose_groups, findings, correlations, summary.
    """
    # Check cache
    cp = _cache_path(study.study_id)
    if _is_cache_valid(study):
        with open(cp, "r") as f:
            return json.load(f)

    # Compute
    print(f"Computing adverse effects for {study.study_id}...")

    # Step 1: Build dose groups
    dg_data = build_dose_groups(study)
    dose_groups = dg_data["dose_groups"]
    subjects = dg_data["subjects"]

    # Step 1b: Identify early-death subjects for dual-pass
    early_death_subjects = get_early_death_subjects(study, subjects)
    excluded_set = set(early_death_subjects.keys()) if early_death_subjects else None
    n_excluded = len(excluded_set) if excluded_set else 0

    # Step 2: Compute findings from each domain (pass 1 — all animals)
    all_findings = []
    all_findings.extend(compute_lb_findings(study, subjects))
    all_findings.extend(compute_bw_findings(study, subjects))
    all_findings.extend(compute_om_findings(study, subjects))
    all_findings.extend(compute_mi_findings(study, subjects))
    all_findings.extend(compute_ma_findings(study, subjects))
    all_findings.extend(compute_tf_findings(study, subjects))
    all_findings.extend(compute_cl_findings(study, subjects))

    # Pass 2 — scheduled-only stats for terminal + LB domains
    if excluded_set:
        scheduled_findings_map: dict[tuple, dict] = {}
        for sched_f in compute_mi_findings(study, subjects, excluded_subjects=excluded_set):
            key = (sched_f["domain"], sched_f["test_code"], sched_f["sex"], sched_f.get("day"))
            scheduled_findings_map[key] = sched_f
        for sched_f in compute_ma_findings(study, subjects, excluded_subjects=excluded_set):
            key = (sched_f["domain"], sched_f["test_code"], sched_f["sex"], sched_f.get("day"))
            scheduled_findings_map[key] = sched_f
        for sched_f in compute_om_findings(study, subjects, excluded_subjects=excluded_set):
            key = (sched_f["domain"], sched_f["test_code"], sched_f["sex"], sched_f.get("day"))
            scheduled_findings_map[key] = sched_f
        for sched_f in compute_tf_findings(study, subjects, excluded_subjects=excluded_set):
            key = (sched_f["domain"], sched_f["test_code"], sched_f["sex"], sched_f.get("day"))
            scheduled_findings_map[key] = sched_f
        for sched_f in compute_lb_findings(study, subjects, excluded_subjects=excluded_set):
            key = (sched_f["domain"], sched_f["test_code"], sched_f["sex"], sched_f.get("day"))
            scheduled_findings_map[key] = sched_f

        for finding in all_findings:
            key = (finding["domain"], finding["test_code"], finding["sex"], finding.get("day"))
            sched = scheduled_findings_map.get(key)
            if sched:
                finding["scheduled_group_stats"] = sched["group_stats"]
                finding["scheduled_pairwise"] = sched["pairwise"]
                finding["scheduled_direction"] = sched.get("direction")
                finding["n_excluded"] = n_excluded
            elif finding["domain"] in TERMINAL_DOMAINS or finding["domain"] == LB_DOMAIN:
                # Finding exists in Pass 1 but not Pass 2 — all subjects were
                # early deaths at this timepoint.  Attach empty arrays so the
                # frontend knows "this finding has no data under scheduled-only".
                finding["scheduled_group_stats"] = []
                finding["scheduled_pairwise"] = []
                finding["scheduled_direction"] = None
                finding["n_excluded"] = n_excluded

    # Pass 3 — separate (main-only) stats for in-life domains
    # When recovery pooling is set to "separate", the frontend swaps group_stats
    # with these pre-computed main-only variants (recovery animals excluded).
    has_recovery = subjects["is_recovery"].any()
    if has_recovery:
        main_only_subs = get_terminal_subjects(subjects)
        separate_map: dict[tuple, dict] = {}

        def _sep_key(f: dict) -> tuple:
            return (f["domain"], f["test_code"], f["sex"], f.get("day"))

        for sep_f in compute_bw_findings(study, main_only_subs):
            separate_map[_sep_key(sep_f)] = sep_f
        for sep_f in compute_lb_findings(study, main_only_subs):
            separate_map[_sep_key(sep_f)] = sep_f
        for sep_f in compute_cl_findings(study, main_only_subs):
            separate_map[_sep_key(sep_f)] = sep_f

        for finding in all_findings:
            if finding["domain"] in IN_LIFE_DOMAINS:
                key = _sep_key(finding)
                sep = separate_map.get(key)
                if sep:
                    finding["separate_group_stats"] = sep["group_stats"]
                    finding["separate_pairwise"] = sep["pairwise"]
                    finding["separate_direction"] = sep.get("direction")
                else:
                    finding["separate_group_stats"] = []
                    finding["separate_pairwise"] = []
                    finding["separate_direction"] = None

    # Step 3: Assign IDs and classify
    for i, finding in enumerate(all_findings):
        # Deterministic ID from content — include specimen for domains that use it
        # (OM, MI, MA, TF, CL all share test_code across specimens)
        specimen_part = finding.get("specimen") or ""
        id_str = f"{finding['domain']}_{finding['test_code']}_{specimen_part}_{finding.get('day', '')}_{finding['sex']}"
        finding["id"] = hashlib.md5(id_str.encode()).hexdigest()[:12]

        # Classify
        finding["severity"] = classify_severity(finding)
        dr_result = classify_dose_response(
            finding.get("group_stats", []),
            finding.get("data_type", "continuous"),
        )
        finding["dose_response_pattern"] = dr_result["pattern"]
        finding["pattern_confidence"] = dr_result.get("confidence")
        finding["onset_dose_level"] = dr_result.get("onset_dose_level")
        finding["treatment_related"] = determine_treatment_related(finding)

        # Fold change (continuous endpoints only)
        finding["max_fold_change"] = compute_max_fold_change(
            finding.get("group_stats", [])
        ) if finding.get("data_type") == "continuous" else None

        # Enrich with organ_system and endpoint_label (same logic as generator)
        finding["organ_system"] = get_organ_system(
            finding.get("specimen"),
            finding.get("test_code"),
            finding.get("domain"),
        )
        test_name = finding.get("test_name", finding.get("test_code", ""))
        specimen = finding.get("specimen")
        if specimen and finding.get("domain") in ("MI", "MA", "CL", "OM", "TF"):
            finding["endpoint_label"] = f"{specimen} \u2014 {test_name}"
        else:
            finding["endpoint_label"] = test_name

    # Step 4: Correlations
    correlations = compute_correlations(all_findings)

    # Step 5: Summary
    severity_counts = {"adverse": 0, "warning": 0, "normal": 0}
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
    suggested_noael = None
    adverse_dose_levels = set()
    for f in all_findings:
        if f.get("severity") == "adverse":
            for pw in f.get("pairwise", []):
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

    # Cache
    with open(cp, "w") as f:
        json.dump(result, f)
    print(f"Adverse effects cached: {len(all_findings)} findings, "
          f"{severity_counts['adverse']} adverse, {severity_counts['warning']} warning")

    return result
