"""Incidence-based recovery comparison for CL / MI / MA domains.

Unified recovery verdict engine with full 7-guard chain ported from
the histopathology pipeline (recovery-assessment.ts). Examination-aware
denominators, severity tiebreaker (MI/MA only), sex-stratified iteration.

Usage:
    from services.analysis.incidence_recovery import compute_incidence_verdict, compute_incidence_recovery

Functions:
    compute_incidence_verdict: Full guard chain + ratio-based verdict
    compute_incidence_recovery: DataFrame-level processing (filter, group, count, verdict)
"""

from __future__ import annotations

import pandas as pd

# Severity text → numeric grade mapping (matches findings_mi.py)
SEVERITY_SCORES = {"MINIMAL": 1, "MILD": 2, "MODERATE": 3, "MARKED": 4, "SEVERE": 5}

# ── Normal-observation terms to exclude ──────────────────────
NORMAL_TERMS = frozenset({
    "NORMAL", "WITHIN NORMAL LIMITS", "WNL",
    "NO ABNORMALITIES", "UNREMARKABLE", "NONE", "NAN", "",
})

# ── Thresholds ───────────────────────────────────────────────
# Matches DEFAULT_VERDICT_THRESHOLDS in recovery-assessment.ts
MIN_RECOVERY_N = 3
MIN_ADEQUATE_N = 5
LOW_POWER_THRESHOLD = 2

VERDICT_THRESHOLDS = {
    "reversed_incidence": 0.2,
    "reversed_severity": 0.3,
    "partially_reversed_incidence": 0.5,
    "partially_reversed_severity": 0.5,
    "progressing_incidence": 1.1,
    "progressing_severity": 1.2,
}


def compute_incidence_verdict(
    main_examined: int,
    main_affected: int,
    rec_examined: int,
    rec_affected: int,
    main_avg_severity: float | None = None,
    rec_avg_severity: float | None = None,
    use_severity: bool = False,
) -> str | None:
    """Full 7-guard chain + severity-aware verdict.

    Ported from frontend recovery-assessment.ts computeVerdict().

    Guard order (v4):
      0. rec_examined == 0             → not_examined
      1. rec_examined < MIN_RECOVERY_N → insufficient_n
      2. main_inc=0 & rec_affected>0  → anomaly
      3. main_inc=0 & main_affected=0 → not_observed
      4. main_inc * rec_examined < 2   → low_power
      5. rec_inc == 0                  → reversed
      6-10. Ratio computation with severity tiebreaker

    Returns one of: reversed, partially_reversed, persistent, progressing,
    anomaly, not_examined, insufficient_n, low_power, not_observed, or None.
    """
    # Guard 0: tissue not examined in recovery arm
    if rec_examined == 0:
        return "not_examined"

    # Guard 1: insufficient examined subjects
    if rec_examined < MIN_RECOVERY_N:
        return "insufficient_n"

    # Compute examination-aware incidence
    main_inc = main_affected / main_examined if main_examined > 0 else 0.0
    rec_inc = rec_affected / rec_examined

    # Guard 2: anomaly — recovery has findings where main arm had none
    if main_inc == 0 and main_affected == 0 and rec_affected > 0:
        return "anomaly"

    # Guard 3: main arm had no findings at this dose level
    if main_inc == 0 and main_affected == 0:
        return "not_observed"

    # Guard 4: low statistical power
    if main_inc * rec_examined < LOW_POWER_THRESHOLD:
        return "low_power"

    # Guard 5: recovery has zero affected (tissue was examined — guard 0 passed)
    if rec_inc == 0:
        return "reversed"

    # ── Ratio computation ─────────────────────────────────────
    inc_ratio = rec_inc / main_inc if main_inc > 0 else float("inf")

    # Severity ratio (MI/MA only, per decision §7.3)
    sev_ratio = 1.0
    if use_severity and main_avg_severity is not None and main_avg_severity > 0:
        sev_ratio = (rec_avg_severity / main_avg_severity) if rec_avg_severity is not None else 1.0
    has_severity = use_severity and main_avg_severity is not None and main_avg_severity > 0

    T = VERDICT_THRESHOLDS

    # Progressing checks
    if inc_ratio > T["progressing_incidence"] and rec_affected > main_affected:
        return "progressing"
    if has_severity and sev_ratio > T["progressing_severity"]:
        return "progressing"

    # Reversed (both incidence and severity must be low)
    if has_severity:
        if inc_ratio <= T["reversed_incidence"] and sev_ratio <= T["reversed_severity"]:
            return "reversed"
    else:
        if inc_ratio <= T["reversed_incidence"]:
            return "reversed"

    # Partially reversed (either dimension)
    if has_severity:
        if inc_ratio <= T["partially_reversed_incidence"] or sev_ratio <= T["partially_reversed_severity"]:
            return "partially_reversed"
    else:
        if inc_ratio <= T["partially_reversed_incidence"]:
            return "partially_reversed"

    return "persistent"


def _count_severity_grades(match_df: pd.DataFrame, sev_col: str) -> dict[str, int] | None:
    """Count severity grades (1-5) from matched rows. Returns None if no grades."""
    if sev_col not in match_df.columns:
        return None
    sev_vals = match_df[sev_col].astype(str).str.strip().str.upper().map(SEVERITY_SCORES)
    sev_vals = sev_vals.dropna()
    if len(sev_vals) == 0:
        return None
    counts: dict[str, int] = {}
    for v in sev_vals:
        key = str(int(v))
        counts[key] = counts.get(key, 0) + 1
    return counts


def _avg_severity(match_df: pd.DataFrame, sev_col: str) -> float | None:
    """Compute mean severity grade from matched rows. Returns None if no grades."""
    if sev_col not in match_df.columns:
        return None
    sev_vals = match_df[sev_col].astype(str).str.strip().str.upper().map(SEVERITY_SCORES)
    sev_vals = sev_vals.dropna()
    if len(sev_vals) == 0:
        return None
    return float(sev_vals.mean())


def compute_incidence_recovery(
    cl_df: pd.DataFrame,
    subjects_df: pd.DataFrame,
    domain_key: str,
    day_col: str,
    last_dosing_day: int | None = None,
    recovery_day: int | None = None,
    specimen_col: str | None = None,
    sev_col: str | None = None,
) -> list[dict]:
    """Compute incidence recovery rows for a CL / MI / MA domain.

    Args:
        cl_df: Raw domain DataFrame (must have USUBJID, observation column, day_col).
              Includes NORMAL records — used for examination-aware denominators.
        subjects_df: Subject roster with USUBJID, SEX, dose_level, dose_label, is_recovery.
        domain_key: Domain identifier (e.g. "cl", "mi").
        day_col: Column name for study day (e.g. "CLDY").
        last_dosing_day: Treatment/recovery boundary day. None disables time-period filtering.
        recovery_day: Recovery sacrifice day (for output metadata).
        specimen_col: Optional specimen/organ column (e.g. "MISPEC"). When set, rows
            are grouped by (specimen, finding) and include a ``specimen`` field.
        sev_col: Optional severity column (e.g. "MISEV"). When set, each row includes
            ``main_severity_counts`` and ``recovery_severity_counts`` dicts mapping
            grade (1-5) to count, plus severity is used in verdict computation.

    Returns:
        List of incidence recovery row dicts.
    """
    prefix = domain_key.upper()
    stresc_col = f"{prefix}STRESC"
    orres_col = f"{prefix}ORRES"
    obs_col = stresc_col if stresc_col in cl_df.columns else (orres_col if orres_col in cl_df.columns else None)
    if obs_col is None:
        return []

    # ── Prepare full frame (for examined counts) and abnormal frame (for affected counts) ──
    full_df = cl_df.copy()
    full_df[obs_col] = full_df[obs_col].astype(str).str.strip().str.upper()

    # Normalise specimen column if provided
    has_specimen = specimen_col is not None and specimen_col in full_df.columns
    if has_specimen:
        full_df[specimen_col] = full_df[specimen_col].astype(str).str.strip().str.upper()

    # Abnormal = exclude normal observations
    abnormal_df = full_df[~full_df[obs_col].isin(NORMAL_TERMS)].copy()
    if abnormal_df.empty:
        return []

    # Join both frames with subject metadata
    join_cols = ["USUBJID", "SEX", "dose_level", "dose_label", "is_recovery"]
    full_df = full_df.merge(subjects_df[join_cols], on="USUBJID", how="inner")
    abnormal_df = abnormal_df.merge(subjects_df[join_cols], on="USUBJID", how="inner")

    # ── Time-period filtering ──────────────────────────────────
    if last_dosing_day is not None and day_col in full_df.columns:
        full_df[day_col] = pd.to_numeric(full_df[day_col], errors="coerce")
        abnormal_df[day_col] = pd.to_numeric(abnormal_df[day_col], errors="coerce")

        full_main = full_df[~full_df["is_recovery"] & (full_df[day_col].isna() | (full_df[day_col] <= last_dosing_day))]
        full_rec = full_df[full_df["is_recovery"] & (full_df[day_col].isna() | (full_df[day_col] > last_dosing_day))]
        main_df = abnormal_df[~abnormal_df["is_recovery"] & (abnormal_df[day_col].isna() | (abnormal_df[day_col] <= last_dosing_day))]
        rec_df = abnormal_df[abnormal_df["is_recovery"] & (abnormal_df[day_col].isna() | (abnormal_df[day_col] > last_dosing_day))]
    else:
        full_main = full_df[~full_df["is_recovery"]]
        full_rec = full_df[full_df["is_recovery"]]
        main_df = abnormal_df[~abnormal_df["is_recovery"]]
        rec_df = abnormal_df[abnormal_df["is_recovery"]]

    # ── Pre-compute examined counts ────────────────────────────
    # For MI/MA (has_specimen): "examined" = subjects with ANY record (including
    # NORMAL) for this specimen. SEND MI/MA systematically records NORMAL for
    # every examined tissue, so record presence ≡ examination.
    # For CL (no specimen): NORMAL is NOT systematically recorded, so we fall
    # back to roster N (all live animals are observed for clinical signs).
    if has_specimen:
        def _build_examined_map(frame: pd.DataFrame) -> dict:
            """Build (specimen, sex, dose) → examined count mapping."""
            if frame.empty:
                return {}
            grp = frame.groupby([specimen_col, "SEX", "dose_level"])["USUBJID"].nunique()
            return {(spec, sex, dl): int(n) for (spec, sex, dl), n in grp.items()}

        main_examined_map = _build_examined_map(full_main)
        rec_examined_map = _build_examined_map(full_rec)
    else:
        main_examined_map = None  # Will use roster N
        rec_examined_map = None

    # Subject roster for total N (kept for metadata — examined is for verdicts)
    roster = subjects_df.groupby(["SEX", "dose_level", "is_recovery"]).agg(
        n=("USUBJID", "nunique"),
        dose_label=("dose_label", "first"),
    ).reset_index()

    # Severity tiebreaker applies to MI/MA only (decision §7.3)
    use_severity = sev_col is not None and domain_key.lower() in ("mi", "ma")

    # ── Pre-index roster for O(1) lookup ─────────────────────
    roster_map: dict[tuple, tuple[int, str]] = {}  # (sex, dose_level, is_recovery) → (n, dose_label)
    for _, r in roster.iterrows():
        roster_map[(r["SEX"], r["dose_level"], r["is_recovery"])] = (int(r["n"]), str(r["dose_label"]))

    # ── Groupby-based iteration ──────────────────────────────
    # Instead of iterating over the Cartesian product of all specimens ×
    # findings × sexes × dose_levels (O(S×F×2×D) mask operations), group
    # the DataFrames once and iterate only over groups that exist.
    group_cols = [obs_col, "SEX", "dose_level"]
    if has_specimen:
        group_cols = [specimen_col] + group_cols

    # Build grouped dicts: key → sub-DataFrame
    main_groups = dict(list(main_df.groupby(group_cols))) if not main_df.empty else {}
    rec_groups = dict(list(rec_df.groupby(group_cols))) if not rec_df.empty else {}

    # Iterate over union of group keys
    all_keys = set(main_groups.keys()) | set(rec_groups.keys())

    rows: list[dict] = []

    for key in sorted(all_keys):
        if has_specimen:
            specimen_val, finding_name, sex_val, dose_level = key
        else:
            finding_name, sex_val, dose_level = key
            specimen_val = None

        main_match = main_groups.get(key, main_df.iloc[:0])
        rec_match = rec_groups.get(key, rec_df.iloc[:0])

        main_affected = main_match["USUBJID"].nunique()
        rec_affected = rec_match["USUBJID"].nunique()

        # Total N and dose label (from pre-indexed roster)
        main_n, main_dose_label = roster_map.get((sex_val, dose_level, False), (0, ""))
        rec_n, rec_dose_label = roster_map.get((sex_val, dose_level, True), (0, ""))
        dose_label_str = main_dose_label or rec_dose_label

        # Examined counts: MI/MA uses record-based counting (NORMAL
        # records prove examination), CL falls back to roster N
        if main_examined_map is not None:
            exam_key = (specimen_val, sex_val, dose_level)
            main_examined = main_examined_map.get(exam_key, 0)
            rec_examined = rec_examined_map.get(exam_key, 0)
        else:
            main_examined = main_n
            rec_examined = rec_n

        if main_n == 0 and rec_n == 0:
            continue
        if main_affected == 0 and rec_affected == 0:
            continue

        # Avg severity for verdict tiebreaker
        main_avg_sev = _avg_severity(main_match, sev_col) if sev_col else None
        rec_avg_sev = _avg_severity(rec_match, sev_col) if sev_col else None

        # Full 7-guard chain verdict (control group gets None)
        verdict = None if dose_level == 0 else compute_incidence_verdict(
            main_examined=main_examined,
            main_affected=main_affected,
            rec_examined=rec_examined,
            rec_affected=rec_affected,
            main_avg_severity=main_avg_sev,
            rec_avg_severity=rec_avg_sev,
            use_severity=use_severity,
        )

        # Confidence flag
        confidence = None
        if verdict is not None and dose_level != 0:
            confidence = "low" if rec_examined < MIN_ADEQUATE_N else "adequate"

        row: dict = {
            "domain": domain_key.upper(),
            "finding": finding_name,
            "sex": sex_val,
            "dose_level": int(dose_level),
            "dose_label": dose_label_str,
            "main_affected": main_affected,
            "main_n": main_n,
            "main_examined": main_examined,
            "recovery_affected": rec_affected,
            "recovery_n": rec_n,
            "recovery_examined": rec_examined,
            "recovery_day": recovery_day,
            "verdict": verdict,
            "confidence": confidence,
        }

        if has_specimen and specimen_val is not None:
            row["specimen"] = specimen_val

        if sev_col:
            row["main_severity_counts"] = _count_severity_grades(main_match, sev_col)
            row["recovery_severity_counts"] = _count_severity_grades(rec_match, sev_col)
            row["main_avg_severity"] = main_avg_sev
            row["recovery_avg_severity"] = rec_avg_sev

        rows.append(row)

    return rows
