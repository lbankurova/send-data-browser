"""Unit tests for hcd_evidence builder and invariants.

Covers F1 (schema + drift_flag + INV-1..4), F2 (γ contribution schedule,
combined-negative, two-sided tier cap), F4 (β-adjunct reliability gate).

Spec: docs/_internal/incoming/hcd-mi-ma-s08-wiring-synthesis.md
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis.hcd_evidence import (  # noqa: E402
    HcdEvidenceInvariantError,
    build_hcd_evidence,
    compute_drift_flag,
    compute_fisher_p,
    empty_hcd_evidence,
    validate_hcd_evidence,
)


# ---------------------------------------------------------------------------
# F1: empty record (AC-F9-2 no-silent-absence)
# ---------------------------------------------------------------------------

def test_empty_record_has_every_field_explicit_null():
    rec = empty_hcd_evidence()
    required = {
        "background_rate", "background_n_animals", "background_n_studies",
        "source", "year_range", "match_tier", "match_confidence",
        "percentile_of_observed", "fisher_p_vs_hcd", "drift_flag",
        "confidence_contribution", "contribution_components",
        "alpha_applies", "reason", "alpha_scaled_threshold",
        "noael_floor_applied", "cell_n_below_reliability_threshold",
    }
    assert set(rec.keys()) == required
    assert rec["confidence_contribution"] == 0
    assert rec["alpha_applies"] is False
    assert rec["noael_floor_applied"] is False


# ---------------------------------------------------------------------------
# F1 AC-F1-6: drift_flag null-path when study_start_year unresolvable
# ---------------------------------------------------------------------------

def test_drift_flag_null_when_study_year_missing():
    # C15 + year_max=2005 + unresolvable study_year -> None + [drift_unknown]
    hcd_row = {
        "mean_incidence_pct": 40.0, "min_incidence_pct": 20.0, "max_incidence_pct": 60.0,
        "n_animals": 200, "n_studies": 5,
        "source": "ntp_iad",
        "year_min": 2000, "year_max": 2005,
        "severity_scale_version": None, "terminology_version": None,
        "severity_distribution": None,
        "n_affected": 80,
        "match_tier": 1, "match_confidence": "high",
    }
    rec = build_hcd_evidence(
        hcd_row,
        observed_n_affected=5, observed_n_total=10,
        catalog_id="C15", study_start_year=None,
    )
    assert rec["drift_flag"] is None
    assert rec["source"].endswith(" [drift_unknown]")


def test_drift_flag_true_when_year_gap_exceeds_window_and_catalog_sensitive():
    hcd_row = {
        "mean_incidence_pct": 40.0, "min_incidence_pct": 20.0, "max_incidence_pct": 60.0,
        "n_animals": 200, "n_studies": 5, "source": "ntp_iad",
        "year_min": 2000, "year_max": 2005,
        "severity_scale_version": None, "terminology_version": None,
        "severity_distribution": None, "n_affected": 80,
        "match_tier": 1, "match_confidence": "high",
    }
    rec = build_hcd_evidence(
        hcd_row,
        observed_n_affected=5, observed_n_total=10,
        catalog_id="C15", study_start_year=2024,
    )
    # 2005 < 2024-10 -> True
    assert rec["drift_flag"] is True
    # source has no [drift_unknown] suffix
    assert "[drift_unknown]" not in (rec["source"] or "")


def test_drift_flag_false_when_catalog_not_sensitive():
    assert compute_drift_flag("C01", 2005, 2024) is False


def test_drift_flag_false_when_year_gap_within_window():
    # 2018 within 2024-10=2014 window => False
    assert compute_drift_flag("C15", 2018, 2024) is False


# ---------------------------------------------------------------------------
# F2 AC-F2-3: components dict is complete (every key present, audit-grep)
# ---------------------------------------------------------------------------

def test_contribution_components_always_complete():
    rec = build_hcd_evidence(
        None,
        observed_n_affected=0, observed_n_total=10,
        catalog_id="C14", study_start_year=2024,
    )
    components = rec["contribution_components"]
    assert set(components.keys()) == {
        "gt_95th_percentile", "gt_99th_percentile",
        "below_5th_down_direction", "ultra_rare_any_occurrence",
        "tier_cap_applied", "hcd_discordant_protective",
    }


# ---------------------------------------------------------------------------
# F2 AC-F2-8: combined-negative contribution (below_5th + hcd_discordant)
# ---------------------------------------------------------------------------

def test_combined_negative_uncapped_on_tier_1_or_2():
    # Background 30% (common), observed 0/20 -> percentile ~0 (< 5th), direction "down"
    hcd_row = {
        "mean_incidence_pct": 30.0, "min_incidence_pct": 15.0, "max_incidence_pct": 50.0,
        "n_animals": 200, "n_studies": 5, "source": "test",
        "year_min": 2018, "year_max": 2022,
        "severity_scale_version": None, "terminology_version": None,
        "severity_distribution": None, "n_affected": 60,
        "match_tier": 1, "match_confidence": "high",
    }
    rec = build_hcd_evidence(
        hcd_row,
        observed_n_affected=0, observed_n_total=20,
        catalog_id="C14", study_start_year=2024,
        direction="down", ctrl_pct=10.0,
    )
    components = rec["contribution_components"]
    assert components["below_5th_down_direction"] == -1
    assert components["hcd_discordant_protective"] == -1
    assert components["tier_cap_applied"] is False
    assert rec["confidence_contribution"] == -2


def test_combined_negative_capped_on_tier_3():
    hcd_row = {
        "mean_incidence_pct": 30.0, "min_incidence_pct": 15.0, "max_incidence_pct": 50.0,
        "n_animals": 200, "n_studies": 5, "source": "test",
        "year_min": 2018, "year_max": 2022,
        "severity_scale_version": None, "terminology_version": None,
        "severity_distribution": None, "n_affected": 60,
        "match_tier": 3, "match_confidence": "low",
    }
    rec = build_hcd_evidence(
        hcd_row,
        observed_n_affected=0, observed_n_total=20,
        catalog_id="C14", study_start_year=2024,
        direction="down", ctrl_pct=10.0,
    )
    assert rec["confidence_contribution"] == -1
    assert rec["contribution_components"]["tier_cap_applied"] is True


# ---------------------------------------------------------------------------
# F2 AC-F2-9: two-sided tier cap -- schedule max raw = +3 (gt_99 + ultra_rare)
# ---------------------------------------------------------------------------

def test_two_sided_tier_cap_positive_max():
    # Percentile > 99 (gt_99 = +2). Ultra-rare + observed gives +1.
    # To hit ultra_rare we need bg_rate < 0.005.
    # But gt_99 requires observed above 99th percentile of bg distribution.
    # Construct with bg_rate = 0.002 (0.2%), max = 0.004, observed = 0.5 > max.
    hcd_row = {
        "mean_incidence_pct": 0.2, "min_incidence_pct": 0.0, "max_incidence_pct": 0.4,
        "n_animals": 1000, "n_studies": 20, "source": "test",
        "year_min": 2018, "year_max": 2022,
        "severity_scale_version": None, "terminology_version": None,
        "severity_distribution": None, "n_affected": 2,
        "match_tier": 3, "match_confidence": "low",
    }
    rec = build_hcd_evidence(
        hcd_row,
        observed_n_affected=5, observed_n_total=10,  # 50% observed
        catalog_id="C14", study_start_year=2024,
        direction="up",
    )
    # Observed 50% > max 0.4% -> percentile 100 -> gt_99
    # Ultra-rare + observed > 0 -> +1
    # Raw total = 3, tier=3 -> cap to +1
    assert rec["contribution_components"]["gt_99th_percentile"] == 2
    assert rec["contribution_components"]["ultra_rare_any_occurrence"] == 1
    assert rec["confidence_contribution"] == 1
    assert rec["contribution_components"]["tier_cap_applied"] is True


def test_two_sided_tier_cap_positive_uncapped_on_tier_1():
    hcd_row = {
        "mean_incidence_pct": 0.2, "min_incidence_pct": 0.0, "max_incidence_pct": 0.4,
        "n_animals": 1000, "n_studies": 20, "source": "test",
        "year_min": 2018, "year_max": 2022,
        "severity_scale_version": None, "terminology_version": None,
        "severity_distribution": None, "n_affected": 2,
        "match_tier": 1, "match_confidence": "high",
    }
    rec = build_hcd_evidence(
        hcd_row,
        observed_n_affected=5, observed_n_total=10,
        catalog_id="C14", study_start_year=2024,
        direction="up",
    )
    assert rec["confidence_contribution"] == 3
    assert rec["contribution_components"]["tier_cap_applied"] is False


# ---------------------------------------------------------------------------
# F2 AC-F2-10: INV-1 mutual exclusivity (validator rejects co-fire)
# ---------------------------------------------------------------------------

def test_inv1_validator_rejects_gt95_and_gt99_cofire():
    bad = empty_hcd_evidence()
    bad["contribution_components"]["gt_95th_percentile"] = 1
    bad["contribution_components"]["gt_99th_percentile"] = 2
    bad["confidence_contribution"] = 3
    with pytest.raises(HcdEvidenceInvariantError, match="INV-1"):
        validate_hcd_evidence(bad)


# ---------------------------------------------------------------------------
# F2 AC-F2-11: INV-3 arithmetic verification (bool excluded from sum)
# ---------------------------------------------------------------------------

def test_inv3_arithmetic_excludes_tier_cap_bool():
    # Fabricate: gt_95=1, others=0, tier_cap_applied=True (should NOT add to sum)
    rec = empty_hcd_evidence()
    rec["contribution_components"] = {
        "gt_95th_percentile": 1,
        "gt_99th_percentile": 0,
        "below_5th_down_direction": 0,
        "ultra_rare_any_occurrence": 0,
        "tier_cap_applied": True,
        "hcd_discordant_protective": 0,
    }
    rec["match_tier"] = 3
    # If sum counted True->1, raw=2 -> tier-3 capped to 1. Valid.
    # Proper INV-3: raw=1 -> no cap needed -> contribution must equal 1, and
    # tier_cap_applied must be False. We pass True to force the validator to
    # fail, proving the arithmetic excludes the bool.
    rec["confidence_contribution"] = 1
    with pytest.raises(HcdEvidenceInvariantError, match="INV-2"):
        validate_hcd_evidence(rec)


# ---------------------------------------------------------------------------
# F4 AC-F4-1: worked-example 2/4 vs 8% binomial tail ~ 0.035
# ---------------------------------------------------------------------------

def test_beta_adjunct_worked_example_binomial():
    # 2/4 observed vs 8% background with large reference N=1000 -> binomial-tail.
    p = compute_fisher_p(
        observed_affected=2, observed_total=4,
        background_rate=0.08,
        background_n_animals=1000,
    )
    # scipy.stats.binom.sf(1, 4, 0.08) = 1 - CDF(1) at n=4, p=0.08
    # = 0.0344 (approx)
    assert p is not None
    assert 0.025 < p < 0.05


# ---------------------------------------------------------------------------
# F4 AC-F4-2: withheld when N is missing
# ---------------------------------------------------------------------------

def test_beta_adjunct_withheld_when_n_missing():
    p = compute_fisher_p(
        observed_affected=2, observed_total=4,
        background_rate=0.08,
        background_n_animals=None,
    )
    assert p is None


# ---------------------------------------------------------------------------
# F4 AC-F4-4: reliability gate -- N<100 withholds, 100<=N<500 uses Fisher
# ---------------------------------------------------------------------------

def test_beta_adjunct_withheld_below_reliability_threshold():
    p = compute_fisher_p(
        observed_affected=2, observed_total=4,
        background_rate=0.08,
        background_n_animals=80,  # < 100
    )
    assert p is None


def test_beta_adjunct_uses_fisher_in_mid_n_regime():
    # 100 <= N < 500 -> Fisher's exact
    p = compute_fisher_p(
        observed_affected=5, observed_total=10,
        background_rate=0.10,
        background_n_animals=150,
        background_n_affected=15,
    )
    assert p is not None
    assert 0.0 <= p <= 1.0


# ---------------------------------------------------------------------------
# F1 AC-F1-3: cell_n_below_reliability_threshold + percentile withheld
# ---------------------------------------------------------------------------

def test_percentile_withheld_when_cell_n_below_threshold():
    hcd_row = {
        "mean_incidence_pct": 20.0, "min_incidence_pct": 10.0, "max_incidence_pct": 40.0,
        "n_animals": 50,  # < 100
        "n_studies": 5, "source": "chamanza_2010",
        "year_min": 2005, "year_max": 2010,
        "severity_scale_version": None, "terminology_version": None,
        "severity_distribution": None, "n_affected": 10,
        "match_tier": 1, "match_confidence": "high",
    }
    rec = build_hcd_evidence(
        hcd_row,
        observed_n_affected=2, observed_n_total=4,
        catalog_id="C08", study_start_year=2024,
    )
    assert rec["cell_n_below_reliability_threshold"] is True
    assert rec["percentile_of_observed"] is None


# ---------------------------------------------------------------------------
# F1 AC-F1-1: records with None hcd_row still emit the full shape
# ---------------------------------------------------------------------------

def test_no_match_emits_explicit_null_record():
    rec = build_hcd_evidence(
        None,
        observed_n_affected=0, observed_n_total=10,
        catalog_id="C14", study_start_year=2024,
    )
    assert rec["background_rate"] is None
    assert rec["match_tier"] is None
    assert rec["confidence_contribution"] == 0
    # Every component key present (audit-grep)
    assert len(rec["contribution_components"]) == 6
