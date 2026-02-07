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
from services.analysis.findings_cl import compute_cl_findings
from services.analysis.classification import (
    classify_severity, classify_dose_response, determine_treatment_related,
)
from services.analysis.correlations import compute_correlations
from services.analysis.context_panes import build_finding_context


def _sanitize_floats(obj):
    """Replace NaN/Inf float values with None, convert numpy scalars to Python types."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (float, np.floating)):
        val = float(obj)
        return None if (math.isnan(val) or math.isinf(val)) else val
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
    relevant = ["dm", "tx", "lb", "bw", "om", "mi", "ma", "cl"]
    mtimes = []
    for domain in relevant:
        if domain in study.xpt_files:
            mtimes.append(study.xpt_files[domain].stat().st_mtime)
    return max(mtimes) if mtimes else 0


def _is_cache_valid(study: StudyInfo) -> bool:
    """Check if cached JSON is newer than all relevant XPT files."""
    cp = _cache_path(study.study_id)
    if not cp.exists():
        return False
    cache_mtime = cp.stat().st_mtime
    return cache_mtime > _get_xpt_max_mtime(study)


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

    # Step 2: Compute findings from each domain
    all_findings = []
    all_findings.extend(compute_lb_findings(study, subjects))
    all_findings.extend(compute_bw_findings(study, subjects))
    all_findings.extend(compute_om_findings(study, subjects))
    all_findings.extend(compute_mi_findings(study, subjects))
    all_findings.extend(compute_ma_findings(study, subjects))
    all_findings.extend(compute_cl_findings(study, subjects))

    # Step 3: Assign IDs and classify
    for i, finding in enumerate(all_findings):
        # Deterministic ID from content
        id_str = f"{finding['domain']}_{finding['test_code']}_{finding.get('day', '')}_{finding['sex']}"
        finding["id"] = hashlib.md5(id_str.encode()).hexdigest()[:12]

        # Classify
        finding["severity"] = classify_severity(finding)
        finding["dose_response_pattern"] = classify_dose_response(
            finding.get("group_stats", []),
            finding.get("data_type", "continuous"),
        )
        finding["treatment_related"] = determine_treatment_related(finding)

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
