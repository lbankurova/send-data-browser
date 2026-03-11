"""Tests for incidence recovery verdict logic and time-period filtering.

Covers:
  Fix 2 (M-2): CL incidence "worsening" verdict
  Fix 3 (m-4): CL time-period filter (recovery-arm records restricted to post-dosing)

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
)


# ═══════════════════════════════════════════════════════════
# compute_incidence_verdict — pure verdict logic
# ═══════════════════════════════════════════════════════════


class TestComputeIncidenceVerdict:
    def test_resolved_when_recovery_zero(self):
        assert compute_incidence_verdict(0.4, 0.0) == "resolved"

    def test_improving_when_recovery_less_than_main(self):
        assert compute_incidence_verdict(0.6, 0.2) == "improving"

    def test_persistent_when_equal(self):
        assert compute_incidence_verdict(0.4, 0.4) == "persistent"

    def test_worsening_when_recovery_exceeds_main(self):
        assert compute_incidence_verdict(0.2, 0.6) == "worsening"

    def test_new_in_recovery_when_main_zero(self):
        assert compute_incidence_verdict(0.0, 0.4) == "new_in_recovery"

    def test_resolved_when_both_zero(self):
        # Both arms zero → rec_inc == 0 → resolved (no finding to persist)
        assert compute_incidence_verdict(0.0, 0.0) == "resolved"

    def test_worsening_boundary_just_above(self):
        # rec slightly > main → worsening
        assert compute_incidence_verdict(0.40, 0.41) == "worsening"

    def test_persistent_boundary_exact_equal(self):
        assert compute_incidence_verdict(0.33, 0.33) == "persistent"

    def test_resolved_main_has_incidence(self):
        # main had findings, recovery has zero → resolved
        assert compute_incidence_verdict(0.8, 0.0) == "resolved"

    def test_worsening_20pct_to_60pct(self):
        """The specific scenario from the spec: 20% → 60% should be worsening, not persistent."""
        assert compute_incidence_verdict(0.2, 0.6) == "worsening"


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


# ═══════════════════════════════════════════════════════════
# compute_incidence_recovery — DataFrame integration
# ═══════════════════════════════════════════════════════════


class TestComputeIncidenceRecovery:
    """Integration tests with synthetic DataFrames."""

    def test_basic_resolved(self):
        """Main arm has findings, recovery has none → resolved."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "SWELLING", "CLDY": 20},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        r = rows[0]
        assert r["verdict"] == "resolved"
        assert r["main_affected"] == 2
        assert r["main_n"] == 5
        assert r["recovery_affected"] == 0
        assert r["recovery_n"] == 3

    def test_worsening_verdict(self):
        """Recovery incidence exceeds main → worsening (Fix 2, M-2)."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            # Main: 1/5 = 20%
            {"USUBJID": "M1", "CLSTRESC": "EDEMA", "CLDY": 10},
            # Recovery: 2/3 = 67%
            {"USUBJID": "R1", "CLSTRESC": "EDEMA", "CLDY": 100},
            {"USUBJID": "R2", "CLSTRESC": "EDEMA", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "worsening"
        assert rows[0]["main_affected"] == 1
        assert rows[0]["recovery_affected"] == 2

    def test_persistent_verdict(self):
        """Equal incidence in both arms → persistent."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            # Main: 1/3 = 33%
            {"USUBJID": "M1", "CLSTRESC": "MASS", "CLDY": 10},
            # Recovery: 1/3 = 33%
            {"USUBJID": "R1", "CLSTRESC": "MASS", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "persistent"

    def test_improving_verdict(self):
        """Recovery incidence less than main → improving."""
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
        assert rows[0]["verdict"] == "improving"

    def test_new_in_recovery(self):
        """Finding appears only in recovery arm → new_in_recovery."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            {"USUBJID": "R1", "CLSTRESC": "ALOPECIA", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "new_in_recovery"

    # ── Fix 3 (m-4): Time-period filtering ──────────────────

    def test_time_filter_excludes_treatment_phase_from_recovery(self):
        """Recovery-arm CL obs from treatment period excluded (Fix 3, m-4).

        Scenario: Recovery animal R1 has CL observations on day 10 (treatment)
        and day 100 (recovery). With last_dosing_day=90, only day 100 counts.
        """
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            # Main arm: 2 affected during treatment
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "SWELLING", "CLDY": 20},
            # Recovery animal with TREATMENT-PHASE observation (should be excluded)
            {"USUBJID": "R1", "CLSTRESC": "SWELLING", "CLDY": 10},
            # Recovery animal with true recovery observation
            {"USUBJID": "R2", "CLSTRESC": "SWELLING", "CLDY": 100},
        ])

        rows = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=90,
        )
        assert len(rows) == 1
        r = rows[0]
        # Only R2's day-100 observation counts in recovery
        assert r["recovery_affected"] == 1
        assert r["main_affected"] == 2
        # Without time filter, R1's day-10 obs would also count → rec_affected=2 → worsening
        # With time filter: 1/3 < 2/5 → improving
        assert r["verdict"] == "improving"

    def test_time_filter_changes_verdict(self):
        """Without filter: worsening. With filter: resolved.

        Demonstrates the filter prevents false worsening signals.
        """
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            # Main arm: 1/5 = 20%
            {"USUBJID": "M1", "CLSTRESC": "LESION", "CLDY": 15},
            # Recovery animals with treatment-phase observations only
            # (these are pre-dosing boundary, should be filtered out)
            {"USUBJID": "R1", "CLSTRESC": "LESION", "CLDY": 10},
            {"USUBJID": "R2", "CLSTRESC": "LESION", "CLDY": 20},
        ])

        # Without filter: recovery has 2/3 = 67% → worsening
        rows_no_filter = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=None,
        )
        assert rows_no_filter[0]["verdict"] == "worsening"

        # With filter (last_dosing_day=90): both R1 and R2 observations are ≤90
        # so they're excluded from recovery → rec_affected=0 → resolved
        rows_filtered = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=90,
        )
        assert rows_filtered[0]["verdict"] == "resolved"

    def test_time_filter_boundary_day(self):
        """Observations exactly on last_dosing_day go to main, day+1 to recovery."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            # Main: finding on exact boundary day → included in main
            {"USUBJID": "M1", "CLSTRESC": "REDNESS", "CLDY": 90},
            # Recovery: finding on boundary day → excluded (≤90, not >90)
            {"USUBJID": "R1", "CLSTRESC": "REDNESS", "CLDY": 90},
            # Recovery: finding on day after boundary → included
            {"USUBJID": "R2", "CLSTRESC": "REDNESS", "CLDY": 91},
        ])

        rows = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=90,
        )
        assert len(rows) == 1
        r = rows[0]
        assert r["main_affected"] == 1  # M1 on day 90
        assert r["recovery_affected"] == 1  # R2 on day 91, NOT R1 on day 90

    def test_null_days_preserved(self):
        """Records with NULL CLDY pass through in both arms."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1", "R2", "R3"],
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "NODULE", "CLDY": None},
            {"USUBJID": "R1", "CLSTRESC": "NODULE", "CLDY": None},
        ])

        rows = compute_incidence_recovery(
            cl, subjects, "cl", "CLDY", last_dosing_day=90,
        )
        assert len(rows) == 1
        assert rows[0]["main_affected"] == 1
        assert rows[0]["recovery_affected"] == 1
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

    def test_control_dose_excluded(self):
        """Dose level 0 (control) should not appear in results."""
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
        dose_levels = {r["dose_level"] for r in rows}
        assert 0 not in dose_levels

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
        assert rows[0]["finding"] == "SWELLING"  # Uppercased


# ═══════════════════════════════════════════════════════════
# SLA-15: MIN_RECOVERY_N guard
# ═══════════════════════════════════════════════════════════


class TestMinRecoveryNGuard:
    """SLA-15: CL recovery with too few recovery animals → insufficient_n."""

    def test_verdict_insufficient_n_when_below_threshold(self):
        """rec_n < MIN_RECOVERY_N → insufficient_n regardless of incidence."""
        from services.analysis.incidence_recovery import MIN_RECOVERY_N
        assert MIN_RECOVERY_N == 3
        assert compute_incidence_verdict(0.5, 0.0, rec_n=0) == "insufficient_n"
        assert compute_incidence_verdict(0.5, 0.0, rec_n=1) == "insufficient_n"
        assert compute_incidence_verdict(0.5, 0.0, rec_n=2) == "insufficient_n"

    def test_verdict_normal_when_at_threshold(self):
        """rec_n == MIN_RECOVERY_N → normal verdict logic applies."""
        assert compute_incidence_verdict(0.5, 0.0, rec_n=3) == "resolved"
        assert compute_incidence_verdict(0.5, 0.3, rec_n=3) == "improving"
        assert compute_incidence_verdict(0.5, 0.8, rec_n=3) == "worsening"

    def test_verdict_none_skips_guard(self):
        """rec_n=None (default) skips the guard for backward compat."""
        assert compute_incidence_verdict(0.5, 0.0) == "resolved"
        assert compute_incidence_verdict(0.5, 0.0, rec_n=None) == "resolved"

    def test_integration_small_recovery_arm(self):
        """DataFrame-level: 2 recovery subjects → insufficient_n verdict."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2"],  # only 2 — below MIN_RECOVERY_N
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
        """DataFrame-level: 3 recovery subjects → normal verdict."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3", "M4", "M5"],
            rec_ids=["R1", "R2", "R3"],  # 3 — at MIN_RECOVERY_N
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "SWELLING", "CLDY": 10},
            {"USUBJID": "M2", "CLSTRESC": "SWELLING", "CLDY": 20},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "resolved"
        assert rows[0]["recovery_n"] == 3

    def test_integration_single_animal_no_definitive_verdict(self):
        """A CL finding with N=1 in recovery should not get 'resolved'."""
        subjects = make_subjects_df(
            main_ids=["M1", "M2", "M3"],
            rec_ids=["R1"],  # single recovery animal
        )
        cl = make_cl_df([
            {"USUBJID": "M1", "CLSTRESC": "TREMOR", "CLDY": 10},
        ])

        rows = compute_incidence_recovery(cl, subjects, "cl", "CLDY")
        assert len(rows) == 1
        assert rows[0]["verdict"] == "insufficient_n"
