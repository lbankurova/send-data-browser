"""Tests for incidence recovery verdict logic — unified 7-guard chain.

Covers:
  - Full guard chain (not_examined, insufficient_n, anomaly, not_observed, low_power)
  - Examination-aware denominators
  - Severity tiebreaker (MI/MA only)
  - Sex-restricted recovery arm handling
  - Unified vocabulary (reversed, partially_reversed, persistent, progressing, anomaly)
  - Time-period filtering
  - Confidence flag

Run: cd backend && python -m pytest tests/test_incidence_recovery.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import pytest

from services.analysis.incidence_recovery import (
    compute_incidence_verdict,
    compute_incidence_recovery,
    MIN_RECOVERY_N,
    MIN_ADEQUATE_N,
    LOW_POWER_THRESHOLD,
)


# ═══════════════════════════════════════════════════════════
# compute_incidence_verdict — full 7-guard chain
# ═══════════════════════════════════════════════════════════


class TestGuard0NotExamined:
    """Guard 0: rec_examined == 0 → not_examined."""

    def test_zero_examined_returns_not_examined(self):
        assert compute_incidence_verdict(10, 5, 0, 0) == "not_examined"

    def test_zero_examined_ignores_main_data(self):
        assert compute_incidence_verdict(10, 8, 0, 0) == "not_examined"


class TestGuard1InsufficientN:
    """Guard 1: rec_examined < MIN_RECOVERY_N → insufficient_n."""

    def test_one_examined(self):
        assert compute_incidence_verdict(10, 5, 1, 0) == "insufficient_n"

    def test_two_examined(self):
        assert compute_incidence_verdict(10, 5, 2, 1) == "insufficient_n"

    def test_at_threshold_passes(self):
        assert MIN_RECOVERY_N == 3
        # 3 examined, 0 affected, main had findings → should pass guard
        result = compute_incidence_verdict(10, 5, 3, 0)
        assert result != "insufficient_n"


class TestGuard2Anomaly:
    """Guard 2: main_inc=0, rec_affected>0 → anomaly."""

    def test_finding_only_in_recovery(self):
        assert compute_incidence_verdict(10, 0, 5, 2) == "anomaly"

    def test_main_zero_affected_recovery_has_findings(self):
        assert compute_incidence_verdict(10, 0, 3, 1) == "anomaly"


class TestGuard3NotObserved:
    """Guard 3: main_inc=0, main_affected=0, rec_affected=0 → not_observed."""

    def test_no_findings_either_arm(self):
        # This case: main had 0 affected, recovery had 0 affected
        # But both were examined. Finding was not observed.
        assert compute_incidence_verdict(10, 0, 5, 0) == "not_observed"


class TestGuard4LowPower:
    """Guard 4: main_inc * rec_examined < LOW_POWER_THRESHOLD → low_power."""

    def test_low_main_incidence_small_recovery(self):
        # main: 1/10 = 10%, rec_examined=5, expected = 0.5 < 2
        assert compute_incidence_verdict(10, 1, 5, 0) == "low_power"

    def test_barely_below_threshold(self):
        # main: 3/10 = 30%, rec_examined=5, expected = 1.5 < 2
        assert compute_incidence_verdict(10, 3, 5, 0) == "low_power"

    def test_at_threshold_passes(self):
        # main: 4/10 = 40%, rec_examined=5, expected = 2.0 — NOT low_power
        result = compute_incidence_verdict(10, 4, 5, 0)
        assert result != "low_power"
        assert result == "reversed"  # rec_affected=0 → reversed


class TestGuard5Reversed:
    """Guard 5: rec_inc=0 (but tissue was examined) → reversed."""

    def test_no_recovery_findings(self):
        assert compute_incidence_verdict(10, 5, 5, 0) == "reversed"

    def test_high_main_no_recovery(self):
        assert compute_incidence_verdict(10, 8, 5, 0) == "reversed"


class TestRatioVerdicts:
    """Steps 6-10: ratio-based verdict computation."""

    def test_partially_reversed_lower_incidence(self):
        # main: 6/10=60%, rec: 2/5=40%, ratio=0.67 → partially_reversed (≤0.5 OR sev)
        # Actually ratio 0.67 > 0.5 so without severity → persistent
        # Let's use: main: 10/10=100%, rec: 2/5=40%, ratio=0.4 ≤ 0.5
        assert compute_incidence_verdict(10, 10, 5, 2) == "partially_reversed"

    def test_persistent_similar_incidence(self):
        # main: 5/10=50%, rec: 3/5=60%, ratio=1.2 — not > 1.1 with more affected
        # rec_affected=3 < main_affected=5, so not progressing
        # ratio 1.2 > 0.5, no severity → persistent
        assert compute_incidence_verdict(10, 5, 5, 3) == "persistent"

    def test_progressing_higher_incidence_more_affected(self):
        # main: 4/10=40%, rec: 5/5=100%, ratio=2.5 > 1.1, rec_affected > main_affected
        # (main_inc * rec_examined = 0.4 * 5 = 2.0 ≥ LOW_POWER_THRESHOLD)
        assert compute_incidence_verdict(10, 4, 5, 5) == "progressing"

    def test_reversed_very_low_ratio(self):
        # main: 8/10=80%, rec: 1/10=10%, ratio=0.125 ≤ 0.2
        assert compute_incidence_verdict(10, 8, 10, 1) == "reversed"


class TestSeverityTiebreaker:
    """Severity ratio modifies verdict for MI/MA domains."""

    def test_severity_drop_overrides_to_partially_reversed(self):
        # Incidence ratio ~1.0 (persistent), but severity drops significantly
        # main: 5/10=50%, rec: 3/5=60%, inc_ratio=1.2, persistent without severity
        # With severity: main_avg=3.0, rec_avg=1.0, sev_ratio=0.33 ≤ 0.5 → partially_reversed
        result = compute_incidence_verdict(
            10, 5, 5, 3,
            main_avg_severity=3.0, rec_avg_severity=1.0,
            use_severity=True,
        )
        assert result == "partially_reversed"

    def test_severity_increase_overrides_to_progressing(self):
        # Incidence drops but severity increases
        # main: 5/10=50%, rec: 2/5=40%, inc_ratio=0.8 — would be persistent
        # severity: main_avg=2.0, rec_avg=3.0, sev_ratio=1.5 > 1.2 → progressing
        result = compute_incidence_verdict(
            10, 5, 5, 2,
            main_avg_severity=2.0, rec_avg_severity=3.0,
            use_severity=True,
        )
        assert result == "progressing"

    def test_severity_ignored_when_flag_false(self):
        # Same data as above but use_severity=False → persistent (incidence-only)
        result = compute_incidence_verdict(
            10, 5, 5, 3,
            main_avg_severity=3.0, rec_avg_severity=1.0,
            use_severity=False,
        )
        assert result == "persistent"

    def test_severity_both_low_reversed(self):
        # Both incidence and severity very low → reversed
        # main: 10/10=100%, rec: 1/10=10%, inc_ratio=0.1 ≤ 0.2
        # severity: main=4.0, rec=1.0, sev_ratio=0.25 ≤ 0.3
        result = compute_incidence_verdict(
            10, 10, 10, 1,
            main_avg_severity=4.0, rec_avg_severity=1.0,
            use_severity=True,
        )
        assert result == "reversed"


# ═══════════════════════════════════════════════════════════
# Fixtures for DataFrame-level tests
# ═══════════════════════════════════════════════════════════


def make_subjects_df(
    main_ids: list[str],
    rec_ids: list[str],
    sex: str = "M",
    dose_level: int = 1,
    dose_label: str = "100 mg/kg",
) -> pd.DataFrame:
    """Build a minimal subjects roster with main + recovery arms."""
    rows = []
    # Control subjects (dose 0) — needed for dose_level iteration
    rows.append({
        "USUBJID": "CTRL-001", "SEX": sex,
        "dose_level": 0, "dose_label": "0 mg/kg", "is_recovery": False,
    })
    for uid in main_ids:
        rows.append({
            "USUBJID": uid, "SEX": sex,
            "dose_level": dose_level, "dose_label": dose_label, "is_recovery": False,
        })
    for uid in rec_ids:
        rows.append({
            "USUBJID": uid, "SEX": sex,
            "dose_level": dose_level, "dose_label": dose_label, "is_recovery": True,
        })
    return pd.DataFrame(rows)


def make_cl_df(
    records: list[dict],
) -> pd.DataFrame:
    """Build a minimal CL domain DataFrame.

    Each record: {"USUBJID": str, "CLSTRESC": str, "CLDY": int}
    """
    df = pd.DataFrame(records)
    if "CLDY" not in df.columns:
        df["CLDY"] = 1
    return df


def make_mi_df(
    records: list[dict],
) -> pd.DataFrame:
    """Build a minimal MI domain DataFrame.

    Each record: {"USUBJID": str, "MISTRESC": str, "MIDY": int, "MISPEC": str, "MISEV": str}
    Normal records should be included for examination-aware counting.
    """
    df = pd.DataFrame(records)
    if "MIDY" not in df.columns:
        df["MIDY"] = 1
    return df


# ═══════════════════════════════════════════════════════════
# compute_incidence_recovery — DataFrame integration
# ═══════════════════════════════════════════════════════════


class TestComputeIncidenceRecovery:
    """Integration tests with synthetic DataFrames."""

    def test_basic_reversed(self):
        """Main arm has findings, recovery has none → reversed."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3", "R4", "R5"],
        )
        cl = make_cl_df([
            # Main: 4/5=80%, rec: 0/5=0%. Expected=0.8*5=4.0 ≥ 2 → passes low_power
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "SWELLING", "CLDY": 15},
            {"USUBJID": "M3", "CLSTRESC": "SWELLING", "CLDY": 20},
            {"USUBJID": "M4", "CLSTRESC": "SWELLING", "CLDY": 25},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        r = rows[0]
        assert r["verdict"] == "reversed"
        assert r["main_affected"] == 4
        assert r["recovery_affected"] == 0

    def test_progressing_verdict(self):
        """Recovery incidence exceeds main → progressing."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3", "R4", "R5"],
        )
        cl = make_cl_df([
            # Main: 3/5=60%, rec: 4/5=80%. Expected=0.6*5=3.0 ≥ 2
            # ratio=1.33 > 1.1, rec_affected=4 > main_affected=3 → progressing
            {"USUBJID": "M1", "CLSTRESC": "EDEMA", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "EDEMA", "CLDY": 15},
            {"USUBJID": "M3", "CLSTRESC": "EDEMA", "CLDY": 20},
            {"USUBJID": "R1", "CLSTRESC": "EDEMA", "CLDY": 100},
            {"USUBJID": "R2", "CLSTRESC": "EDEMA", "CLDY": 100},
            {"USUBJID": "R3", "CLSTRESC": "EDEMA", "CLDY": 100},
            {"USUBJID": "R4", "CLSTRESC": "EDEMA", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "progressing"
        assert rows[0]["main_affected"] == 3
        assert rows[0]["recovery_affected"] == 4

    def test_persistent_verdict(self):
        """Equal incidence in both arms → persistent."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3", "R4", "R5"],
        )
        cl = make_cl_df([
            # Main: 3/5=60%, rec: 3/5=60%. Expected=0.6*5=3.0 ≥ 2
            # ratio=1.0, persistent
            {"USUBJID": "M1", "CLSTRESC": "MASS", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "MASS", "CLDY": 15},
            {"USUBJID": "M3", "CLSTRESC": "MASS", "CLDY": 20},
            {"USUBJID": "R1", "CLSTRESC": "MASS", "CLDY": 100},
            {"USUBJID": "R2", "CLSTRESC": "MASS", "CLDY": 100},
            {"USUBJID": "R3", "CLSTRESC": "MASS", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "persistent"

    def test_partially_reversed_verdict(self):
        """Recovery incidence less than main → partially_reversed."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3", "R4", "R5"],
        )
        cl = make_cl_df([
            # Main: 3/5 = 60%
            {"USUBJID": "M1", "CLSTRESC": "SCAB", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "SCAB", "CLDY": 15},
            {"USUBJID": "M3", "CLSTRESC": "SCAB", "CLDY": 20},
            # Recovery: 1/5 = 20%
            {"USUBJID": "R1", "CLSTRESC": "SCAB", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "partially_reversed"

    def test_anomaly_new_in_recovery(self):
        """Finding appears only in recovery arm → anomaly."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            {"USUBJID": "R1", "CLSTRESC": "ALOPECIA", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "anomaly"

    def test_output_includes_examined_counts(self):
        """Rows include main_examined and recovery_examined fields."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "R1", "CLSTRESC": "SWELLING", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert "main_examined" in rows[0]
        assert "recovery_examined" in rows[0]

    def test_confidence_field(self):
        """Rows include confidence: low when rec_examined < 5, adequate otherwise."""
        # 3 recovery subjects → low confidence
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
        ])
        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert rows[0]["confidence"] == "low"

        # 5 recovery subjects → adequate confidence
        subjects5 = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3", "R4", "R5"],
        )
        rows5 = compute_incidence_recovery(cl, subjects5, "cl", "CLDY")
        assert rows5[0]["confidence"] == "adequate"

    # ── Time-period filtering ──────────────────────────────────

    def test_time_filter_excludes_treatment_phase_from_recovery(self):
        """Recovery-arm CL obs from treatment period excluded."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "SWELLING", "CLDY": 20},
            {"USUBJID": "R1", "CLSTRESC": "SWELLING", "CLDY": 10},  # treatment phase — excluded
            {"USUBJID": "R2", "CLSTRESC": "SWELLING", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=90,
        )
        assert len(rows) == 1
        r = rows[0]
        assert r["recovery_affected"] == 1
        assert r["main_affected"] == 2

    def test_time_filter_changes_verdict(self):
        """Without filter: progressing. With filter: reversed."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3", "R4", "R5"],
        )
        cl = make_cl_df([
            # Main: 4/5=80% → expected=0.8*5=4.0 ≥ 2
            {"USUBJID": "M1", "CLSTRESC": "LESION", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "LESION", "CLDY": 15},
            {"USUBJID": "M3", "CLSTRESC": "LESION", "CLDY": 20},
            {"USUBJID": "M4", "CLSTRESC": "LESION", "CLDY": 25},
            # Recovery with treatment-phase observations only
            {"USUBJID": "R1", "CLSTRESC": "LESION", "CLDY": 10},
            {"USUBJID": "R2", "CLSTRESC": "LESION", "CLDY": 20},
            {"USUBJID": "R3", "CLSTRESC": "LESION", "CLDY": 30},
            {"USUBJID": "R4", "CLSTRESC": "LESION", "CLDY": 40},
            {"USUBJID": "R5", "CLSTRESC": "LESION", "CLDY": 50},
        ])

        # Without filter: recovery has 5/5=100% > main 4/5=80%, ratio=1.25 > 1.1
        # rec_affected=5 > main_affected=4 → progressing
        rows_no_filter = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=None,
        )
        assert rows_no_filter[0]["verdict"] == "progressing"

        # With filter (last_dosing_day=90): all R obs ≤90 → excluded → reversed
        rows_filtered = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=90,
        )
        assert rows_filtered[0]["verdict"] == "reversed"

    def test_time_filter_boundary_day(self):
        """Observations exactly on last_dosing_day go to main, day+1 to recovery."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "REDNESS", "CLDY": 90},
            {"USUBJID": "R1", "CLSTRESC": "REDNESS", "CLDY": 90},   # boundary → excluded
            {"USUBJID": "R2", "CLSTRESC": "REDNESS", "CLDY": 91},
        ])

        rows = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=90,
        )
        assert len(rows) == 1
        r = rows[0]
        assert r["main_affected"] == 1
        assert r["recovery_affected"] == 1

    def test_null_days_preserved(self):
        """Records with NULL day pass through in both arms."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3", "R4", "R5"],
        )
        cl = make_cl_df([
            # Main: 3/5=60%, expected=0.6*5=3.0 ≥ 2
            {"USUBJID": "M1", "CLSTRESC": "NODULE", "CLDY": None},
            {"USUBJID": "M2", "CLSTRESC": "NODULE", "CLDY": None},
            {"USUBJID": "M3", "CLSTRESC": "NODULE", "CLDY": None},
            # Recovery: 3/5=60%, ratio=1.0 → persistent
            {"USUBJID": "R1", "CLSTRESC": "NODULE", "CLDY": None},
            {"USUBJID": "R2", "CLSTRESC": "NODULE", "CLDY": None},
            {"USUBJID": "R3", "CLSTRESC": "NODULE", "CLDY": None},
        ])

        rows = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=90,
        )
        assert len(rows) == 1
        assert rows[0]["main_affected"] == 3
        assert rows[0]["recovery_affected"] == 3
        assert rows[0]["verdict"] == "persistent"

    def test_normal_terms_excluded(self):
        """Normal observations are filtered out before counting."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2"],
            rec_ids=["R1", "R2"],
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "NORMAL", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "Within Normal Limits", "CLDY": 15},
            {"USUBJID": "R1", "CLSTRESC": "WNL", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 0  # All observations are normal

    def test_control_dose_included_with_no_verdict(self):
        """Dose level 0 (control) appears in results but has verdict=None."""
        subjects_rows = [
            {"USUBJID": "C1", "SEX": "M", "dose_level": 0, "dose_label": "0 mg/kg", "is_recovery": False},
            {"USUBJID": "C2", "SEX": "M", "dose_level": 0, "dose_label": "0 mg/kg", "is_recovery": True},
            {"USUBJID": "M1", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "R1", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": True},
        ]
        subjects = pd.DataFrame(subjects_rows)
        cl = make_cl_df([
            {"USUBJID": "C1", "CLSTRESC": "REDNESS", "CLDY": 10},
            {"USUBJID": "C2", "CLSTRESC": "REDNESS", "CLDY": 100},
            {"USUBJID": "M1", "CLSTRESC": "REDNESS", "CLDY": 10},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        control_rows = [r for r in rows if r["dose_level"] == 0]
        assert len(control_rows) > 0
        assert all(r["verdict"] is None for r in control_rows)

    def test_orres_fallback(self):
        """Uses CLORRES when CLSTRESC is absent."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2"],
            rec_ids=["R1", "R2"],
        )
        cl = pd.DataFrame([
            {"USUBJID": "M1", "CLORRES": "Swelling", "CLDY": 10},
            {"USUBJID": "R1", "CLORRES": "Swelling", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["finding"] == "SWELLING"


# ═══════════════════════════════════════════════════════════
# Examination-aware denominators
# ═══════════════════════════════════════════════════════════


class TestExaminationAware:
    """Examination-aware denominators for MI/MA domains."""

    def test_mi_examined_from_normal_records(self):
        """MI records with NORMAL contribute to examined count, not affected."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3"],
        )
        mi = make_mi_df([
            # Main: 3 examined (2 normal + 1 affected), only 1 affected
            {"USUBJID": "M1", "MISTRESC": "NORMAL", "MISPEC": "LIVER", "MIDY": 10},
            {"USUBJID": "M2", "MISTRESC": "NORMAL", "MISPEC": "LIVER", "MIDY": 10},
            {"USUBJID": "M3", "MISTRESC": "NECROSIS", "MISPEC": "LIVER", "MISEV": "MODERATE", "MIDY": 10},
            # Recovery: 3 examined (2 normal + 1 affected)
            {"USUBJID": "R1", "MISTRESC": "NORMAL", "MISPEC": "LIVER", "MIDY": 100},
            {"USUBJID": "R2", "MISTRESC": "NORMAL", "MISPEC": "LIVER", "MIDY": 100},
            {"USUBJID": "R3", "MISTRESC": "NECROSIS", "MISPEC": "LIVER", "MISEV": "MINIMAL", "MIDY": 100},
        ])

        rows = compute_incidence_recovery(
            mi, subjects, "mi", "MIDY", specimen_col="MISPEC", sev_col="MISEV",
        )
        liver_rows = [r for r in rows if r.get("specimen") == "LIVER"]
        assert len(liver_rows) == 1
        r = liver_rows[0]
        # Examined = 3 (includes NORMAL subjects), not N=5
        assert r["main_examined"] == 3
        assert r["recovery_examined"] == 3
        assert r["main_affected"] == 1
        assert r["recovery_affected"] == 1

    def test_unexamined_recovery_returns_not_examined(self):
        """MI specimen not examined in recovery arm → not_examined verdict."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        mi = make_mi_df([
            # Main: liver examined, findings present
            {"USUBJID": "M1", "MISTRESC": "NECROSIS", "MISPEC": "LIVER", "MIDY": 10},
            {"USUBJID": "M2", "MISTRESC": "NORMAL", "MISPEC": "LIVER", "MIDY": 10},
            # Recovery: NO liver records at all (tissue not examined)
            {"USUBJID": "R1", "MISTRESC": "NORMAL", "MISPEC": "KIDNEY", "MIDY": 100},
        ])

        rows = compute_incidence_recovery(
            mi, subjects, "mi", "MIDY", specimen_col="MISPEC",
        )
        liver_rows = [r for r in rows if r.get("specimen") == "LIVER"]
        assert len(liver_rows) == 1
        assert liver_rows[0]["verdict"] == "not_examined"
        assert liver_rows[0]["recovery_examined"] == 0


# ═══════════════════════════════════════════════════════════
# Sex-restricted recovery arm
# ═══════════════════════════════════════════════════════════


class TestSexRestrictedRecovery:
    """When only one sex has a recovery arm, the other gets not_examined."""

    def test_males_only_recovery(self):
        """Recovery arm has only males — female row gets not_examined."""
        subjects_rows = [
            # Main: both sexes (5 each for adequate power)
            {"USUBJID": "MF1", "SEX": "F", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MF2", "SEX": "F", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MF3", "SEX": "F", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MF4", "SEX": "F", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MF5", "SEX": "F", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MM1", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MM2", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MM3", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MM4", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            {"USUBJID": "MM5", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": False},
            # Recovery: males only (5 subjects)
            {"USUBJID": "RM1", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": True},
            {"USUBJID": "RM2", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": True},
            {"USUBJID": "RM3", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": True},
            {"USUBJID": "RM4", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": True},
            {"USUBJID": "RM5", "SEX": "M", "dose_level": 1, "dose_label": "100 mg/kg", "is_recovery": True},
            # Control
            {"USUBJID": "C1", "SEX": "M", "dose_level": 0, "dose_label": "0 mg/kg", "is_recovery": False},
        ]
        subjects = pd.DataFrame(subjects_rows)
        cl = make_cl_df([
            # 4/5 = 80% for each sex → expected = 0.8 * 5 = 4.0 ≥ 2
            {"USUBJID": "MF1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "MF2", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "MF3", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "MF4", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "MM1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "MM2", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "MM3", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "MM4", "CLSTRESC": "SWELLING", "CLDY": 10},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        f_rows = [r for r in rows if r["sex"] == "F" and r["dose_level"] == 1]
        m_rows = [r for r in rows if r["sex"] == "M" and r["dose_level"] == 1]

        # Female: no recovery subjects examined → not_examined
        assert len(f_rows) == 1
        assert f_rows[0]["verdict"] == "not_examined"
        assert f_rows[0]["recovery_examined"] == 0

        # Male: recovery subjects present → normal verdict
        assert len(m_rows) == 1
        assert m_rows[0]["verdict"] == "reversed"


# ═══════════════════════════════════════════════════════════
# MIN_RECOVERY_N guard (integration)
# ═══════════════════════════════════════════════════════════


class TestMinRecoveryNGuard:
    """Guard 1 at DataFrame level."""

    def test_integration_small_recovery_arm(self):
        """2 recovery subjects → insufficient_n verdict."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2"],
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "SWELLING", "CLDY": 20},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "insufficient_n"
        assert rows[0]["recovery_n"] == 2

    def test_integration_sufficient_recovery_arm(self):
        """3 recovery subjects with adequate main incidence → reversed."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            # Main: 3/3=100%, expected=1.0*3=3.0 ≥ 2 → passes low_power
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "SWELLING", "CLDY": 15},
            {"USUBJID": "M3", "CLSTRESC": "SWELLING", "CLDY": 20},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "reversed"
        assert rows[0]["recovery_n"] == 3
