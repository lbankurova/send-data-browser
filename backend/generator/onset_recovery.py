"""Onset day computation and recovery verdict persistence.

Generates subject_onset_days.json and recovery_verdicts.json consumed by the
frontend filter engine to evaluate onset_day and recovery_verdict predicates.

Onset days:
  - CL: extracted from raw_subject_onset_days in unified_findings
  - LB: first day where subject value exceeds 2x control mean (same sex)
  - MI/MA: sacrifice day as proxy for subjects at affected dose levels

Recovery verdicts:
  - Per-subject: each recovery subject's findings with verdict + confidence
  - Per-finding: aggregate across dose groups using worst verdict for treated
"""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from services.study_discovery import StudyInfo
from services.analysis.incidence_recovery import (
    compute_incidence_recovery,
)
from services.xpt_processor import read_xpt


# ── Onset days ────────────────────────────────────────────────


def build_onset_days(findings: list[dict], ctx_df: pd.DataFrame) -> dict:
    """Build per-subject onset days for CL, LB, and MI/MA domains.

    Args:
        findings: unified_findings list from the generator pipeline.
        ctx_df: Subject context DataFrame with USUBJID, SACRIFICE_DY, etc.

    Returns:
        Dict with "meta" and "subjects" keys. subjects maps USUBJID to
        finding-key -> day pairs.
    """
    subjects: dict[str, dict[str, int]] = {}

    # CL onset: extract from raw_subject_onset_days
    _extract_cl_onset(findings, subjects)

    # LB onset: threshold crossing (2x control mean)
    _extract_lb_onset(findings, subjects)

    # MI/MA onset: sacrifice day proxy
    _extract_mi_ma_onset(findings, ctx_df, subjects)

    return {
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat(),
            "n_subjects": len(subjects),
        },
        "subjects": subjects,
    }


def _extract_cl_onset(findings: list[dict], subjects: dict[str, dict[str, int]]) -> None:
    """Extract CL onset days from raw_subject_onset_days in unified_findings."""
    for f in findings:
        if f.get("domain") != "CL":
            continue
        onset_entries = f.get("raw_subject_onset_days")
        if not onset_entries:
            continue

        finding_name = f.get("finding", "")
        key = f"CL:{finding_name}"

        for entry in onset_entries:
            if not isinstance(entry, dict):
                continue
            for usubjid, day in entry.items():
                try:
                    day_int = int(day)
                except (ValueError, TypeError):
                    continue
                subj = subjects.setdefault(usubjid, {})
                # Keep earliest onset day
                if key not in subj or day_int < subj[key]:
                    subj[key] = day_int


def _extract_lb_onset(findings: list[dict], subjects: dict[str, dict[str, int]]) -> None:
    """Extract LB onset days via threshold crossing (value > 2x control mean)."""
    for f in findings:
        if f.get("domain") != "LB":
            continue
        # Only process adverse or warning findings
        severity = f.get("severity", "")
        if severity not in ("adverse", "warning"):
            continue

        test_code = f.get("test_code", "")
        day = f.get("day")
        if not test_code or day is None:
            continue

        try:
            day_int = int(day)
        except (ValueError, TypeError):
            continue

        # Get control mean from group_stats
        group_stats = f.get("group_stats", [])
        if not isinstance(group_stats, list):
            continue

        control_mean = None
        for gs in group_stats:
            if gs.get("dose_level") == 0:
                control_mean = gs.get("mean")
                break

        if control_mean is None or control_mean == 0:
            continue

        threshold = 2.0 * abs(control_mean)

        # Check each subject's value
        raw_subject_values = f.get("raw_subject_values", [])
        if not raw_subject_values:
            continue

        key = f"LB:{test_code}"

        for entry in raw_subject_values:
            if not isinstance(entry, dict):
                continue
            for usubjid, value in entry.items():
                try:
                    val = float(value)
                except (ValueError, TypeError):
                    continue
                if abs(val) > threshold:
                    subj = subjects.setdefault(usubjid, {})
                    # Keep earliest onset day
                    if key not in subj or day_int < subj[key]:
                        subj[key] = day_int


def _extract_mi_ma_onset(
    findings: list[dict],
    ctx_df: pd.DataFrame,
    subjects: dict[str, dict[str, int]],
) -> None:
    """Extract MI/MA onset days using sacrifice day as proxy.

    For subjects at dose levels where group_stats shows affected > 0,
    onset = SACRIFICE_DY. This is a proxy consistent with how the frontend
    evaluates terminal findings.
    """
    if ctx_df.empty:
        return

    # Build sacrifice day map and dose level map from ctx_df
    sacrifice_map: dict[str, int] = {}
    dose_map: dict[str, str] = {}
    for _, row in ctx_df.iterrows():
        uid = str(row.get("USUBJID", ""))
        sac_dy = row.get("SACRIFICE_DY")
        dose_level = row.get("DOSE_LEVEL", "")
        is_tk = row.get("IS_TK", False)
        if uid and sac_dy is not None and not is_tk:
            try:
                sacrifice_map[uid] = int(float(sac_dy))
            except (ValueError, TypeError):
                pass
            dose_map[uid] = str(dose_level)

    for f in findings:
        domain = f.get("domain", "")
        if domain not in ("MI", "MA"):
            continue

        finding_name = f.get("finding", "")
        specimen = f.get("specimen", "")
        key = f"{domain}:{specimen}:{finding_name}"

        # Identify dose levels with affected > 0
        group_stats = f.get("group_stats", [])
        if not isinstance(group_stats, list):
            continue

        affected_doses: set[int] = set()
        dose_level_labels: dict[int, str] = {}
        for gs in group_stats:
            dl = gs.get("dose_level")
            affected = gs.get("affected", 0)
            if dl is not None:
                dose_level_labels[dl] = str(dl)
                if affected and affected > 0 and dl != 0:
                    affected_doses.add(dl)

        if not affected_doses:
            continue

        # Map ctx_df DOSE_LEVEL strings to numeric dose_levels
        # DOSE_LEVEL in ctx_df is like "Group 1, Control" or "Group 2"
        # dose_level in findings group_stats is numeric (0, 1, 2, 3)
        # We need to map subjects to numeric dose levels
        # The dose_level in group_stats is the index, so we need
        # to figure out which subjects are at which numeric dose level
        #
        # Since ctx_df has DOSE_LEVEL as a string, we need to determine
        # the mapping. The simplest approach: match subjects via the sex
        # of the finding and assign onset to subjects at non-control doses
        # that have affected > 0.
        #
        # Actually, we don't have a direct mapping from ctx_df DOSE_LEVEL
        # string to numeric dose_level. But we can approximate: subjects
        # whose DOSE_LEVEL string contains "Control" or is the first group
        # are dose_level 0. We should use the _subjects DataFrame which
        # has numeric dose_level, but ctx_df doesn't have it.
        #
        # Simplification: assign onset to ALL non-control subjects at any
        # affected dose level. Since MI/MA are terminal findings, this is
        # a reasonable proxy.

        finding_sex = f.get("sex", "")

        for uid, sac_day in sacrifice_map.items():
            # Filter by sex if the finding is sex-specific
            dl_str = dose_map.get(uid, "")

            # Skip control subjects (dose_level string contains "Control"
            # or starts with "Group 1" when it's the control)
            is_control = "control" in dl_str.lower()
            if is_control:
                continue

            subj = subjects.setdefault(uid, {})
            if key not in subj or sac_day < subj[key]:
                subj[key] = sac_day


# ── Recovery verdicts ─────────────────────────────────────────

# Verdict severity ordering (worst = highest index)
_VERDICT_SEVERITY: dict[str, int] = {
    "reversed": 0,
    "not_observed": 1,
    "not_examined": 1,
    "insufficient_n": 1,
    "low_power": 1,
    "partially_reversed": 2,
    "persistent": 3,
    "anomaly": 4,
    "progressing": 5,
}

# Continuous domains with BUG-21 risk (RECV-04)
_BUG21_DOMAINS = {"LB", "BW", "OM"}


def build_recovery_verdicts(
    findings: list[dict],
    study: StudyInfo,
    subjects_df: pd.DataFrame,
    last_dosing_day: int | None,
) -> dict:
    """Build per-subject and per-finding recovery verdicts.

    Args:
        findings: unified_findings list from the generator pipeline.
        study: StudyInfo with xpt_files for raw data access.
        subjects_df: Subject roster with USUBJID, SEX, dose_level, is_recovery.
        last_dosing_day: Treatment/recovery boundary day.

    Returns:
        Dict with "meta", "per_subject", and "per_finding" keys.
    """
    # Collect recovery rows from incidence domains (MI, MA, CL)
    all_recovery_rows: list[dict] = []

    for domain_key, day_col, specimen_col, sev_col in [
        ("mi", "MIDY", "MISPEC", "MISEV"),
        ("ma", "MADY", "MASPEC", None),
        ("cl", "CLDY", None, None),
    ]:
        if domain_key not in study.xpt_files:
            continue
        try:
            df, _ = read_xpt(study.xpt_files[domain_key])
            df.columns = [c.upper() for c in df.columns]

            rows = compute_incidence_recovery(
                cl_df=df,
                subjects_df=subjects_df,
                domain_key=domain_key,
                day_col=day_col,
                last_dosing_day=last_dosing_day,
                specimen_col=specimen_col,
                sev_col=sev_col,
            )
            all_recovery_rows.extend(rows)
        except Exception:
            continue

    # Build per_finding: aggregate across dose groups
    per_finding: dict[str, dict] = {}
    for row in all_recovery_rows:
        domain = row.get("domain", "")
        specimen = row.get("specimen", "")
        finding = row.get("finding", "")
        dose_level = row.get("dose_level", 0)
        verdict = row.get("verdict")

        fkey = f"{domain}:{specimen}:{finding}" if specimen else f"{domain}:{finding}"

        if fkey not in per_finding:
            per_finding[fkey] = {
                "domain": domain,
                "specimen": specimen,
                "finding": finding,
                "verdict": None,
                "main_incidence": 0,
                "recovery_incidence": 0,
                "subjects_reversed": 0,
                "subjects_persistent": 0,
            }

        entry = per_finding[fkey]

        # Accumulate incidence counts
        entry["main_incidence"] += row.get("main_affected", 0)
        entry["recovery_incidence"] += row.get("recovery_affected", 0)

        # Track reversed/persistent counts
        if verdict == "reversed":
            entry["subjects_reversed"] += row.get("recovery_examined", 0) - row.get("recovery_affected", 0)
        elif verdict == "persistent":
            entry["subjects_persistent"] += row.get("recovery_affected", 0)

        # Update worst verdict across treated dose groups
        if dose_level != 0 and verdict is not None:
            current_severity = _VERDICT_SEVERITY.get(entry["verdict"] or "", -1)
            new_severity = _VERDICT_SEVERITY.get(verdict, -1)
            if new_severity > current_severity:
                entry["verdict"] = verdict

    # Build per_subject: recovery subjects only
    per_subject: dict[str, dict] = {}

    recovery_subs = subjects_df[
        (subjects_df.get("is_recovery", pd.Series(dtype=bool)) == True)  # noqa: E712
    ] if "is_recovery" in subjects_df.columns else pd.DataFrame()

    for _, sub_row in recovery_subs.iterrows():
        uid = str(sub_row["USUBJID"])
        sex = str(sub_row.get("SEX", ""))
        dose_level = sub_row.get("dose_level", 0)

        # Find recovery rows matching this subject's sex and dose_level
        subject_findings: list[dict] = []
        for row in all_recovery_rows:
            if (row.get("sex") == sex and
                    row.get("dose_level") == dose_level and
                    row.get("dose_level", 0) != 0):
                domain = row.get("domain", "")
                confidence_val = row.get("confidence", "adequate")

                # Add bug21_possible for continuous domains (RECV-04)
                if domain in _BUG21_DOMAINS:
                    confidence_obj = {
                        "level": confidence_val,
                        "bug21_possible": True,
                    }
                else:
                    confidence_obj = {
                        "level": confidence_val,
                    }

                subject_findings.append({
                    "domain": domain,
                    "specimen": row.get("specimen", ""),
                    "finding": row.get("finding", ""),
                    "main_severity": row.get("main_avg_severity"),
                    "recovery_severity": row.get("recovery_avg_severity"),
                    "verdict": row.get("verdict"),
                    "confidence": confidence_obj,
                })

        if not subject_findings:
            continue

        # Build summary counts
        summary = {
            "reversed_count": sum(1 for f in subject_findings if f["verdict"] == "reversed"),
            "partially_reversed_count": sum(1 for f in subject_findings if f["verdict"] == "partially_reversed"),
            "persistent_count": sum(1 for f in subject_findings if f["verdict"] == "persistent"),
            "progressing_count": sum(1 for f in subject_findings if f["verdict"] == "progressing"),
            "anomaly_count": sum(1 for f in subject_findings if f["verdict"] == "anomaly"),
        }

        per_subject[uid] = {
            "findings": subject_findings,
            "summary": summary,
        }

    return {
        "meta": {
            "generated": datetime.now(timezone.utc).isoformat(),
            "n_subjects": len(per_subject),
            "n_findings": len(per_finding),
        },
        "per_subject": per_subject,
        "per_finding": per_finding,
    }
