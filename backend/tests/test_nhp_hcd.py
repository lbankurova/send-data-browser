"""Tests for cynomolgus NHP organ weight HCD — Section 1c of the synthesis spec.

Covers: ETL data integrity, species resolution, threshold values, Tier C null
guard, NHP routing, bracket matching, bracket boundaries, regression guards,
age estimation, control vs HCD, and threshold reliability.
"""

from __future__ import annotations

import sqlite3

import pytest

from config import HCD_DB_PATH


# ---------------------------------------------------------------------------
# BP-1: ETL data integrity
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def hcd_conn():
    """Module-scoped read-only connection to hcd.db."""
    conn = sqlite3.connect(str(HCD_DB_PATH))
    conn.row_factory = sqlite3.Row
    yield conn
    conn.close()


def test_nhp_rows_loaded(hcd_conn):
    """hcd_aggregates contains >= 24 NHP rows (5+7 organs x 2 sexes)."""
    count = hcd_conn.execute(
        "SELECT COUNT(*) FROM hcd_aggregates WHERE species = 'MONKEY'"
    ).fetchone()[0]
    assert count >= 24, f"Expected >= 24 NHP rows, got {count}"


def test_no_sd_inflated(hcd_conn):
    """All CYNOMOLGUS entries have sd_inflated IS NULL."""
    inflated = hcd_conn.execute(
        "SELECT COUNT(*) FROM hcd_aggregates WHERE species = 'MONKEY' AND sd_inflated IS NOT NULL"
    ).fetchone()[0]
    assert inflated == 0, f"Expected 0 inflated, got {inflated}"


def test_lr_summing_kidney(hcd_conn):
    """Kidney mean = sum of L+R means from Amato (adult M ~23.08g)."""
    row = hcd_conn.execute(
        "SELECT mean FROM hcd_aggregates WHERE strain='CYNOMOLGUS' AND organ='KIDNEY' "
        "AND sex='M' AND age_months=177.0"
    ).fetchone()
    assert row is not None, "No kidney adult M entry"
    assert abs(row["mean"] - 23.08) < 0.1, f"Kidney mean {row['mean']} != ~23.08"


def test_lr_summing_lungs(hcd_conn):
    """Lung mean = sum of L+R means from Amato (adult M ~27.06g)."""
    row = hcd_conn.execute(
        "SELECT mean FROM hcd_aggregates WHERE strain='CYNOMOLGUS' AND organ='LUNGS' "
        "AND sex='M' AND age_months=177.0"
    ).fetchone()
    assert row is not None
    assert abs(row["mean"] - 27.06) < 0.1


def test_strain_alias(hcd_conn):
    """strain_aliases contains CYNOMOLGUS -> CYNOMOLGUS."""
    alias = hcd_conn.execute(
        "SELECT canonical FROM strain_aliases WHERE alias = 'CYNOMOLGUS'"
    ).fetchone()
    assert alias is not None
    assert alias["canonical"] == "CYNOMOLGUS"


# ---------------------------------------------------------------------------
# BP-2: Species resolution and thresholds
# ---------------------------------------------------------------------------

def test_species_resolution_monkey():
    from services.analysis.organ_thresholds import _resolve_species_category
    assert _resolve_species_category("MONKEY") == "nhp"


def test_species_resolution_cynomolgus_macaque():
    from services.analysis.organ_thresholds import _resolve_species_category
    assert _resolve_species_category("CYNOMOLGUS MACAQUE") == "nhp"


def test_species_resolution_rat_unchanged():
    from services.analysis.organ_thresholds import _resolve_species_category
    assert _resolve_species_category("RAT") == "rat"


def test_threshold_liver_nhp():
    from services.analysis.organ_thresholds import get_organ_threshold
    t = get_organ_threshold("LIVER", "MONKEY")
    assert t is not None
    assert t["variation_ceiling_pct"] == 25
    assert t["adverse_floor_pct"] == 30
    assert t["strong_adverse_pct"] == 50


def test_threshold_brain_nhp():
    from services.analysis.organ_thresholds import get_organ_threshold
    t = get_organ_threshold("BRAIN", "MONKEY")
    assert t is not None
    assert t["variation_ceiling_pct"] == 15


def test_threshold_spleen_nhp_null():
    from services.analysis.organ_thresholds import get_organ_threshold
    t = get_organ_threshold("SPLEEN", "MONKEY")
    assert t is not None
    assert t["variation_ceiling_pct"] is None
    assert t["adverse_floor_pct"] is None
    assert t["strong_adverse_pct"] is None
    assert t.get("nhp_tier") == "C_qualitative"


def test_threshold_rat_liver_unchanged():
    from services.analysis.organ_thresholds import get_organ_threshold
    t = get_organ_threshold("LIVER", "RAT")
    assert t["adverse_floor_pct"] == 10


def test_threshold_dog_liver_unchanged():
    from services.analysis.organ_thresholds import get_organ_threshold
    t = get_organ_threshold("LIVER", "DOG")
    assert t["adverse_floor_pct"] == 25


# ---------------------------------------------------------------------------
# BP-2: Tier C null guard
# ---------------------------------------------------------------------------

def test_tier_c_null_guard():
    """_assess_om_two_gate() with NHP spleen (null thresholds) returns a valid
    classification, not TypeError."""
    from services.analysis.classification import _assess_om_two_gate
    finding = {
        "specimen": "SPLEEN",
        "min_p_adj": 0.03,
        "trend_p": 0.02,
        "group_stats": [
            {"dose_level": 0, "mean": 15.0},
            {"dose_level": 100, "mean": 10.0},
        ],
    }
    result = _assess_om_two_gate(finding, species="MONKEY", a3_score=0.0)
    assert isinstance(result, str), f"Expected string classification, got {type(result)}"
    assert finding.get("_assessment_detail", {}).get("method", "").startswith("nhp_tier_c_qualitative")


# ---------------------------------------------------------------------------
# BP-3: NHP routing and bracket matching
# ---------------------------------------------------------------------------

def test_nhp_routing_activates():
    """assess_a3 for MONKEY returns a non-no_hcd result."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 91,
                  species="MONKEY", age_months=60.0)
    assert r["result"] != "no_hcd"
    assert "young_adult" in r.get("bracket", "")


def test_bracket_boundary_48_young_adult():
    """age=48.0 -> young_adult bracket."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 91,
                  species="MONKEY", age_months=48.0)
    assert r.get("bracket") == "young_adult"


def test_bracket_boundary_47_9_peripubertal_fallback():
    """age=47.9 -> peripubertal bracket, but falls back to young_adult data
    (no peripubertal data in DB). Label should reflect actual data stratum."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 91,
                  species="MONKEY", age_months=47.9)
    # Bracket maps to peripubertal but query_by_age returns young_adult
    # Stratum mismatch detection should relabel to young_adult with LOW confidence
    assert r.get("bracket") == "young_adult"
    assert r.get("confidence") == "LOW"


def test_bracket_boundary_30_in_range():
    """age=30.0 -> in peripubertal bracket [30,48)."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 91,
                  species="MONKEY", age_months=30.0)
    assert r["result"] != "no_hcd", "30mo should be in range"


def test_bracket_boundary_outside_range():
    """age=250.0 -> outside all brackets -> no_hcd."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 91,
                  species="MONKEY", age_months=250.0)
    assert r["result"] == "no_hcd"


def test_duration_360d_estimated_age():
    """duration=360d, no explicit age -> 36+12=48.0mo -> young_adult."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 360, species="MONKEY")
    assert r.get("bracket") == "young_adult"
    assert "age estimated" in r.get("detail", "")


def test_age_estimation_caveat():
    """When age_months not provided, result detail includes 'age estimated'."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 28, species="MONKEY")
    assert "age estimated" in r.get("detail", "")


def test_rat_path_unchanged():
    """assess_a3 for RAT returns identical behavior."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(0.5, "LIVER", "M", "SPRAGUE-DAWLEY", 91)
    assert "bracket" not in r  # rat path has no bracket field


def test_dog_path_unchanged():
    """assess_a3 for DOG returns identical behavior."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(200.0, "LIVER", "M", "BEAGLE", 91, species="DOG")
    assert "bracket" not in r  # dog path has no bracket field


def test_control_vs_hcd():
    """NHP path calls _check_control_vs_hcd."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 91,
                  species="MONKEY", age_months=60.0,
                  control_group_mean=15.0)
    assert "control_outside_hcd" in r


# ---------------------------------------------------------------------------
# BP-4: Threshold reliability
# ---------------------------------------------------------------------------

def test_reliability_nhp_liver_provisional():
    from services.analysis.findings_om import _get_threshold_reliability
    r = _get_threshold_reliability("LIVER", "M", "nhp")
    assert r is not None
    assert r["level"] == "provisional"


def test_reliability_nhp_spleen_qualitative():
    from services.analysis.findings_om import _get_threshold_reliability
    r = _get_threshold_reliability("SPLEEN", "M", "nhp")
    assert r is not None
    assert r["level"] == "qualitative_only"


def test_reliability_nhp_brain_provisional():
    from services.analysis.findings_om import _get_threshold_reliability
    r = _get_threshold_reliability("BRAIN", "M", "nhp")
    assert r is not None
    assert r["level"] == "provisional"


def test_low_power_caveat():
    """NHP HCD results include low_power_caveat field."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 91,
                  species="MONKEY", age_months=60.0)
    assert "low_power_caveat" in r
    assert "Low statistical power" in r["low_power_caveat"]


def test_hcd_source_caveat():
    """NHP HCD results include hcd_source_caveat."""
    from services.analysis.hcd import assess_a3
    r = assess_a3(20.0, "KIDNEY", "M", "CYNOMOLGUS", 91,
                  species="MONKEY", age_months=60.0)
    assert r.get("hcd_source_caveat") == "colony_reference"
