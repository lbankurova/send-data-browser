"""Tests for HCD-informed D4 percentile scoring in confidence.py.

Run: cd backend && python -m pytest tests/test_d4_hcd_scoring.py -v

Covers:
  - Four-tier percentile mapping (extreme, unusual, marginal, within normal)
  - Direction-aware suppression (non-adverse tail -> 0)
  - OM domain exclusion (BW confounding, GAP-257)
  - Binary fallback when percentile_rank is absent
  - Boundary values (2.5, 10, 25, 75, 90, 97.5)
  - Signal score regression invariant (integration)

Topic: hcd-informed-z-scoring
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from services.analysis.confidence import _score_d4_hcd


def _finding(
    domain="LB",
    direction="up",
    hcd_result="within_hcd",
    percentile_rank=50.0,
    detail="test",
):
    """Build a minimal finding dict for D4 testing."""
    hcd = {"result": hcd_result, "detail": detail}
    if percentile_rank is not None:
        hcd["percentile_rank"] = percentile_rank
    return {"domain": domain, "direction": direction, "_hcd_assessment": hcd}


# ════════════════════════════════════════════════════════════
# Tier mapping
# ════════════════════════════════════════════════════════════


class TestPercentileTierMapping:
    """Verify four-tier percentile -> D4 score mapping."""

    def test_extreme_low(self):
        r = _score_d4_hcd(_finding(percentile_rank=1.5, direction="down"))
        assert r["score"] == +1
        assert "extreme" in r["rationale"]

    def test_extreme_high(self):
        r = _score_d4_hcd(_finding(percentile_rank=98.5, direction="up"))
        assert r["score"] == +1
        assert "extreme" in r["rationale"]

    def test_unusual_low(self):
        r = _score_d4_hcd(_finding(percentile_rank=5.0, direction="down"))
        assert r["score"] == +1
        assert "unusual" in r["rationale"]

    def test_unusual_high(self):
        r = _score_d4_hcd(_finding(percentile_rank=92.0, direction="up"))
        assert r["score"] == +1
        assert "unusual" in r["rationale"]

    def test_marginal_low(self):
        r = _score_d4_hcd(_finding(percentile_rank=15.0, direction="down"))
        assert r["score"] == 0
        assert "marginal" in r["rationale"]

    def test_marginal_high(self):
        r = _score_d4_hcd(_finding(percentile_rank=85.0, direction="up"))
        assert r["score"] == 0
        assert "marginal" in r["rationale"]

    def test_within_normal(self):
        r = _score_d4_hcd(_finding(percentile_rank=50.0))
        assert r["score"] == -1
        assert "within normal" in r["rationale"]


# ════════════════════════════════════════════════════════════
# Boundary values
# ════════════════════════════════════════════════════════════


class TestBoundaryValues:
    """Verify exact boundary behavior per tier table."""

    def test_boundary_25_is_within_normal(self):
        r = _score_d4_hcd(_finding(percentile_rank=25.0))
        assert r["score"] == -1

    def test_boundary_75_is_within_normal(self):
        r = _score_d4_hcd(_finding(percentile_rank=75.0))
        assert r["score"] == -1

    def test_boundary_10_is_marginal(self):
        # 10 <= p < 25 -> marginal
        r = _score_d4_hcd(_finding(percentile_rank=10.0, direction="down"))
        assert r["score"] == 0

    def test_boundary_90_is_marginal(self):
        # 75 < p <= 90 -> marginal... but 90 < p -> unusual
        # 90 is the boundary: 75 < 90 <= 90 -> marginal
        r = _score_d4_hcd(_finding(percentile_rank=90.0, direction="up"))
        assert r["score"] == 0

    def test_boundary_2_5_is_extreme(self):
        # p < 2.5 -> extreme; p = 2.5 -> unusual (2.5 <= p < 10)
        r = _score_d4_hcd(_finding(percentile_rank=2.5, direction="down"))
        assert r["score"] == +1  # unusual tier

    def test_boundary_97_5_is_extreme(self):
        # p > 97.5 -> extreme; p = 97.5 -> unusual
        r = _score_d4_hcd(_finding(percentile_rank=97.5, direction="up"))
        assert r["score"] == +1  # unusual tier


# ════════════════════════════════════════════════════════════
# Direction-aware suppression
# ════════════════════════════════════════════════════════════


class TestDirectionSuppression:
    """Non-adverse tail percentiles are suppressed to 0."""

    def test_up_finding_low_percentile_suppressed(self):
        """direction=up, pct<25 -> non-adverse (value is low, finding is up)."""
        r = _score_d4_hcd(_finding(percentile_rank=1.5, direction="up"))
        assert r["score"] == 0
        assert "non-adverse" in r["rationale"]

    def test_up_finding_extreme_low_suppressed(self):
        """Even extreme low percentile suppressed for 'up' finding."""
        r = _score_d4_hcd(_finding(percentile_rank=3.0, direction="up"))
        assert r["score"] == 0

    def test_increase_finding_low_percentile_suppressed(self):
        """direction='increase' (legacy alias) also suppressed."""
        r = _score_d4_hcd(_finding(percentile_rank=1.5, direction="increase"))
        assert r["score"] == 0
        assert "non-adverse" in r["rationale"]

    def test_decrease_finding_high_percentile_suppressed(self):
        """direction='decrease' (legacy alias) also suppressed."""
        r = _score_d4_hcd(_finding(percentile_rank=95.0, direction="decrease"))
        assert r["score"] == 0
        assert "non-adverse" in r["rationale"]

    def test_down_finding_high_percentile_suppressed(self):
        """direction=down, pct>75 -> non-adverse (value is high, finding is down)."""
        r = _score_d4_hcd(_finding(percentile_rank=95.0, direction="down"))
        assert r["score"] == 0
        assert "non-adverse" in r["rationale"]

    def test_up_finding_high_percentile_not_suppressed(self):
        """direction=up, pct>75 -> adverse direction, NOT suppressed."""
        r = _score_d4_hcd(_finding(percentile_rank=95.0, direction="up"))
        assert r["score"] == +1  # unusual tier, not suppressed

    def test_down_finding_low_percentile_not_suppressed(self):
        """direction=down, pct<25 -> adverse direction, NOT suppressed."""
        r = _score_d4_hcd(_finding(percentile_rank=5.0, direction="down"))
        assert r["score"] == +1  # unusual tier, not suppressed

    def test_direction_none_no_suppression(self):
        """direction=None -> no suppression, standard tier mapping."""
        r = _score_d4_hcd(_finding(percentile_rank=92.0, direction=None))
        assert r["score"] == +1  # unusual tier

    def test_direction_none_string_no_suppression(self):
        """direction='none' -> no suppression."""
        r = _score_d4_hcd(_finding(percentile_rank=8.0, direction="none"))
        assert r["score"] == +1  # unusual tier

    def test_direction_mixed_no_suppression(self):
        """direction='mixed' -> no suppression."""
        r = _score_d4_hcd(_finding(percentile_rank=15.0, direction="mixed"))
        assert r["score"] == 0  # marginal tier, no suppression


# ════════════════════════════════════════════════════════════
# OM domain exclusion
# ════════════════════════════════════════════════════════════


class TestOmExclusion:
    """OM domain always uses binary D4, never percentile (GAP-257)."""

    def test_om_uses_binary_even_with_percentile(self):
        r = _score_d4_hcd(_finding(domain="OM", percentile_rank=3.0,
                                   hcd_result="outside_hcd"))
        assert r["score"] == +1
        assert "BW-unadjusted" in r["rationale"]

    def test_om_within_hcd_binary(self):
        r = _score_d4_hcd(_finding(domain="OM", percentile_rank=50.0,
                                   hcd_result="within_hcd"))
        assert r["score"] == -1
        assert "BW-unadjusted" in r["rationale"]

    def test_domain_none_falls_to_binary(self):
        """Unknown domain + no percentile -> binary fallback."""
        r = _score_d4_hcd(_finding(domain=None, percentile_rank=None,
                                   hcd_result="outside_hcd"))
        assert r["score"] == +1
        assert "non-adverse" not in r["rationale"]  # no direction suppression


# ════════════════════════════════════════════════════════════
# Binary fallback
# ════════════════════════════════════════════════════════════


class TestBinaryFallback:
    """When percentile_rank is absent, fall back to within/outside binary."""

    def test_no_percentile_outside(self):
        r = _score_d4_hcd(_finding(percentile_rank=None, hcd_result="outside_hcd"))
        assert r["score"] == +1
        assert "Outside HCD" in r["rationale"]

    def test_no_percentile_within(self):
        r = _score_d4_hcd(_finding(percentile_rank=None, hcd_result="within_hcd"))
        assert r["score"] == -1
        assert "Within HCD" in r["rationale"]

    def test_no_hcd_data(self):
        f = {"domain": "LB", "_hcd_assessment": {"result": "no_hcd"}}
        r = _score_d4_hcd(f)
        assert r["score"] is None
        assert "skipped" in r["rationale"]

    def test_no_hcd_assessment_at_all(self):
        f = {"domain": "LB"}
        r = _score_d4_hcd(f)
        assert r["score"] is None


# Note: TestSignalScoreRegression was a one-time validation tool used during
# implementation to verify 0 signal score changes across 301 PointCross findings.
# It required a _d4_baseline.json snapshot that was created before the D4 change
# and deleted after verification. The test served its purpose and is not
# repeatable in CI (no pre-change baseline to compare against).
