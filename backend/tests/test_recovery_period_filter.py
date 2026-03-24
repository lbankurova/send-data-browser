"""Tests for recovery-comparison time-period filtering and OM timecourse.

The recovery-comparison endpoint must only return rows for days AFTER the
main-arm terminal sacrifice day.  Recovery-arm subjects often have
dosing-period measurements (e.g. BG body weight gains, FW food consumption)
that should NOT appear as "recovery" data.

The timecourse endpoint must accept specimen names for OM domain
(e.g. "TESTIS", "LIVER") in addition to the generic "WEIGHT" test code.

Run: cd backend && python -m pytest tests/test_recovery_period_filter.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import asyncio
import pytest
from services.study_discovery import discover_studies
from routers.temporal import init_temporal, get_recovery_comparison, get_timecourse


# ── Fixtures ──────────────────────────────────────────────

@pytest.fixture(scope="module")
def recovery_result():
    """Call the recovery-comparison endpoint once for PointCross."""
    studies = discover_studies()
    if "PointCross" not in studies:
        pytest.skip("PointCross study not available")
    init_temporal(studies)
    return asyncio.run(get_recovery_comparison("PointCross"))


@pytest.fixture(scope="module")
def rows_by_test_code(recovery_result):
    """Group recovery rows by test_code."""
    from collections import defaultdict
    by_tc = defaultdict(list)
    for r in recovery_result["rows"]:
        by_tc[r["test_code"]].append(r)
    return dict(by_tc)


# ── Recovery period boundary ──────────────────────────────

class TestRecoveryPeriodBoundary:
    """All rows must have day > main-arm terminal sacrifice day."""

    def test_no_rows_at_or_before_terminal_day(self, recovery_result):
        """Every row.day must be strictly after the main-arm terminal day.

        PointCross: last_dosing_day=91, BW terminal=92 → boundary=92.
        """
        last_dosing = recovery_result.get("last_dosing_day", 0) or 0
        # Main-arm terminal is at least last_dosing_day; for PointCross it's 92
        # (BW data extends to day 92).  We check that no row has day ≤ 92.
        boundary = max(last_dosing, 92)  # conservative for PointCross
        for r in recovery_result["rows"]:
            assert r["day"] > boundary, (
                f"Row for {r['test_code']} sex={r['sex']} dose={r['dose_level']} "
                f"has day={r['day']} which is within the main study period (≤{boundary})"
            )

    def test_bwgain_excluded(self, rows_by_test_code):
        """BG (body weight gains) only has dosing-period data for recovery
        subjects (days 1–92).  No rows should be emitted."""
        assert "BWGAIN" not in rows_by_test_code, (
            "BWGAIN should have no recovery-period data but rows were emitted"
        )

    def test_food_consumption_excluded(self, rows_by_test_code):
        """FW (food consumption) only has dosing-period data for recovery
        subjects.  No rows should be emitted."""
        assert "FC" not in rows_by_test_code, (
            "FC should have no recovery-period data but rows were emitted"
        )

    def test_ecg_excluded(self, rows_by_test_code):
        """EG (ECG) endpoints have data at day 90, within the dosing period."""
        for tc in ["HR", "PRAG", "QTCBAG", "RRAG"]:
            assert tc not in rows_by_test_code, (
                f"{tc} should have no recovery-period data but rows were emitted"
            )


# ── Valid recovery data preserved ─────────────────────────

class TestValidRecoveryDataPreserved:
    """Endpoints with actual recovery-period data must still be returned."""

    def test_bw_has_recovery_rows(self, rows_by_test_code):
        """BW has recovery data at days 99, 100, 106."""
        assert "BW" in rows_by_test_code, "BW should have recovery rows"
        days = {r["day"] for r in rows_by_test_code["BW"]}
        assert days.issubset({99, 100, 106}), f"Unexpected BW days: {days}"
        assert 106 in days, "BW should have terminal recovery day 106"

    def test_lb_has_recovery_rows(self, rows_by_test_code):
        """LB endpoints have recovery data at days 100, 106."""
        assert "ALB" in rows_by_test_code, "ALB should have recovery rows"
        days = {r["day"] for r in rows_by_test_code["ALB"]}
        assert days.issubset({100, 106}), f"Unexpected ALB days: {days}"

    def test_om_has_recovery_rows(self, rows_by_test_code):
        """OM (organ weights) have recovery data at day 106."""
        assert "LIVER" in rows_by_test_code, "LIVER weight should have recovery rows"
        days = {r["day"] for r in rows_by_test_code["LIVER"]}
        assert 106 in days, "LIVER should have terminal recovery day 106"


# ── recovery_days_available filtering ─────────────────────

class TestRecoveryDaysAvailable:
    """recovery_days_available must also exclude main-study-period days."""

    def test_bwgain_no_available_days(self, recovery_result):
        """Body Weight Gain should have empty available days."""
        rda = recovery_result.get("recovery_days_available", {})
        bg_days = rda.get("Body Weight Gain", {})
        for sex, days in bg_days.items():
            assert len(days) == 0, (
                f"Body Weight Gain {sex} should have no recovery days but got {days}"
            )

    def test_food_consumption_no_available_days(self, recovery_result):
        rda = recovery_result.get("recovery_days_available", {})
        fc_days = rda.get("Food Consumption", {})
        for sex, days in fc_days.items():
            assert len(days) == 0, (
                f"Food Consumption {sex} should have no recovery days but got {days}"
            )

    def test_bw_has_recovery_days(self, recovery_result):
        """Body Weight should have days 99, 106 (post-terminal)."""
        rda = recovery_result.get("recovery_days_available", {})
        bw_days = rda.get("Body Weight", {})
        assert "F" in bw_days or "M" in bw_days, "BW should have recovery days"
        for sex, days in bw_days.items():
            assert all(d > 92 for d in days), (
                f"BW {sex} has main-study-period day in recovery_days_available: {days}"
            )
            assert 106 in days, f"BW {sex} missing terminal recovery day 106"

    def test_albumin_has_recovery_days(self, recovery_result):
        rda = recovery_result.get("recovery_days_available", {})
        alb_days = rda.get("Albumin", {})
        assert "F" in alb_days or "M" in alb_days, "Albumin should have recovery days"
        for sex, days in alb_days.items():
            assert 106 in days, f"Albumin {sex} missing terminal recovery day 106"


# ── Incidence (MI/MA) unaffected ──────────────────────────

class TestIncidenceUnaffected:
    """MI/MA incidence recovery goes through a separate code path and should
    still work correctly."""

    def test_incidence_rows_present(self, recovery_result):
        """Incidence rows should still be returned for MI/MA findings."""
        inc_rows = recovery_result.get("incidence_rows", [])
        assert len(inc_rows) > 0, "incidence_rows should not be empty"

    def test_incidence_rows_have_verdicts(self, recovery_result):
        """At least some incidence rows should have computed verdicts."""
        inc_rows = recovery_result.get("incidence_rows", [])
        with_verdict = [r for r in inc_rows if r.get("verdict") is not None]
        assert len(with_verdict) > 0, "No incidence rows have verdicts"


# ── OM timecourse specimen routing ────────────────────────

@pytest.fixture(scope="module")
def _init_studies():
    """Ensure temporal router is initialized (shares with recovery_result)."""
    studies = discover_studies()
    if "PointCross" not in studies:
        pytest.skip("PointCross study not available")
    init_temporal(studies)
    return True


class TestOMTimecourseSpecimen:
    """The timecourse endpoint must accept OM specimen names as test_code.

    The unified findings system sets test_code='WEIGHT' for all OM findings,
    but the distribution and time-course charts need per-organ data.  The
    backend remaps OMTESTCD to OMSPEC so that specimen names like 'TESTIS'
    and 'LIVER' resolve to the correct organ's data.
    """

    def test_testis_returns_subjects(self, _init_studies):
        result = asyncio.run(get_timecourse(
            "PointCross", "OM", "TESTIS", sex=None, mode="subject",
            include_recovery=True,
        ))
        subjects = result.get("subjects", [])
        assert len(subjects) > 0, "OM/TESTIS should return subjects"

    def test_testis_has_recovery_data(self, _init_studies):
        result = asyncio.run(get_timecourse(
            "PointCross", "OM", "TESTIS", sex=None, mode="subject",
            include_recovery=True,
        ))
        rec = [s for s in result["subjects"] if s.get("is_recovery")]
        assert len(rec) > 0, "OM/TESTIS should have recovery-arm subjects"
        days = {v["day"] for s in rec for v in s.get("values", [])}
        assert 106 in days, f"Recovery TESTIS data should include day 106, got {days}"

    def test_liver_returns_subjects(self, _init_studies):
        result = asyncio.run(get_timecourse(
            "PointCross", "OM", "LIVER", sex=None, mode="subject",
            include_recovery=True,
        ))
        assert len(result.get("subjects", [])) > 0

    def test_weight_returns_all_organs(self, _init_studies):
        """Requesting 'WEIGHT' returns all organs (backwards compat)."""
        result = asyncio.run(get_timecourse(
            "PointCross", "OM", "WEIGHT", sex=None, mode="subject",
            include_recovery=True,
        ))
        subjects = result.get("subjects", [])
        assert len(subjects) > 0, "OM/WEIGHT should return subjects"

    def test_specimen_filters_correctly(self, _init_studies):
        """TESTIS returns only male subjects (no females have testes)."""
        result = asyncio.run(get_timecourse(
            "PointCross", "OM", "TESTIS", sex=None, mode="subject",
            include_recovery=True,
        ))
        sexes = {s["sex"] for s in result["subjects"]}
        assert sexes == {"M"}, f"TESTIS should only have M subjects, got {sexes}"

    def test_group_mode_works(self, _init_studies):
        """Group mode (D-R chart) should also work with specimen names."""
        result = asyncio.run(get_timecourse(
            "PointCross", "OM", "LIVER", sex=None, mode="group",
            include_recovery=False,
        ))
        tps = result.get("timepoints", [])
        assert len(tps) > 0, "OM/LIVER group mode should return timepoints"
