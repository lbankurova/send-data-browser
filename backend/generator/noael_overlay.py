"""Per-subject NOAEL overlay and signal summary.

Produces per-subject:
  - NOAEL attribution (role, driving findings)
  - Terminal BW % change from sex-matched control mean
  - Max LB fold-change across all LB endpoints

All computed from data available before raw_subject_values are stripped.
"""
from __future__ import annotations


def build_subject_noael_overlay(
    noael_summary: list[dict],
    subject_context: list[dict],
    findings: list[dict] | None = None,
) -> dict:
    """Build per-subject NOAEL attribution + signal summary.

    ``findings`` should include raw_subject_values (call before stripping).
    When None, BW and LB signals are omitted.
    """
    # Build per-sex LOAEL info from noael_summary
    sex_loael: dict[str, dict] = {}
    for row in noael_summary:
        sex = row.get("sex")
        if not sex or sex == "Combined":
            continue
        deriv = row.get("noael_derivation", {})
        loael_level = deriv.get("loael_dose_level")
        adverse = deriv.get("adverse_findings_at_loael", [])
        noael_label = row.get("noael_label")
        sex_loael[sex] = {
            "loael_level": loael_level,
            "findings": adverse,
            "noael_label": noael_label,
        }

    # Per-subject signal extraction from unified findings
    bw_pct, lb_max_fold = _compute_subject_signals(findings, subject_context) if findings else ({}, {})

    subjects: dict[str, dict] = {}

    for sc in subject_context:
        usubjid = sc["USUBJID"]
        sex = sc.get("SEX", "")
        dose_level = sc.get("DOSE_GROUP_ORDER", sc.get("DOSE_LEVEL", 0))
        is_control = sc.get("IS_CONTROL", False)

        info = sex_loael.get(sex)
        if not info or info["loael_level"] is None or is_control:
            subjects[usubjid] = {
                "noael_driving_count": 0,
                "noael_role": "none",
                "sex_noael_label": info["noael_label"] if info else None,
                "findings": [],
                "bw_terminal_pct": bw_pct.get(usubjid),
                "lb_max_fold": lb_max_fold.get(usubjid),
            }
            continue

        loael_level = info["loael_level"]
        adv_findings = info["findings"]

        if dose_level == loael_level:
            role = "determining"
        elif dose_level > loael_level:
            role = "contributing"
        else:
            role = "none"

        slim_findings = [
            {
                "domain": f.get("domain", ""),
                "finding": f.get("finding", ""),
                "specimen": f.get("specimen"),
            }
            for f in adv_findings
        ] if role in ("determining", "contributing") else []

        subjects[usubjid] = {
            "noael_driving_count": len(slim_findings),
            "noael_role": role,
            "sex_noael_label": info["noael_label"],
            "findings": slim_findings,
            "bw_terminal_pct": bw_pct.get(usubjid),
            "lb_max_fold": lb_max_fold.get(usubjid),
        }

    return {"subjects": subjects}


def _compute_subject_signals(
    findings: list[dict],
    subject_context: list[dict],
) -> tuple[dict[str, float], dict[str, float]]:
    """Compute per-subject BW terminal % change and max LB fold-change.

    BW terminal %: (subject_terminal_bw / control_mean - 1) * 100
    LB max fold: max |subject_value / control_mean| across all LB endpoints
    """
    # Build sex lookup
    sex_map: dict[str, str] = {}
    for sc in subject_context:
        sex_map[sc["USUBJID"]] = sc.get("SEX", "")

    bw_pct: dict[str, float] = {}
    bw_day: dict[str, int] = {}  # track which day each subject's BW value is from
    lb_max_fold: dict[str, float] = {}

    for f in findings:
        rsv = f.get("raw_subject_values")
        if not rsv:
            continue
        domain = f.get("domain", "")
        sex = f.get("sex", "")

        # Control mean from group_stats
        ctrl = None
        for gs in f.get("group_stats", []):
            if gs.get("dose_level") == 0:
                ctrl = gs
                break
        if not ctrl or not ctrl.get("mean"):
            continue
        ctrl_mean = ctrl["mean"]
        if ctrl_mean == 0:
            continue

        if domain == "BW":
            day = f.get("day") or 0
            for dose_group_values in rsv:
                for uid, val in dose_group_values.items():
                    if val is None:
                        continue
                    if sex_map.get(uid, "") != sex:
                        continue
                    # Keep only the latest (highest) day per subject
                    prev_day = bw_day.get(uid, -1)
                    if day >= prev_day:
                        bw_pct[uid] = round((val / ctrl_mean - 1) * 100, 1)
                        bw_day[uid] = day

        elif domain == "LB":
            for dose_group_values in rsv:
                for uid, val in dose_group_values.items():
                    if val is None:
                        continue
                    if sex_map.get(uid, "") != sex:
                        continue
                    fold = abs(val / ctrl_mean)
                    existing = lb_max_fold.get(uid)
                    if existing is None or fold > existing:
                        lb_max_fold[uid] = round(fold, 2)

    return bw_pct, lb_max_fold
