"""C7 corroboration evaluator + predicate registry tests.

Covers:
- A1 mechanism-vs-observation cardinality split (any-one compound_class:* vs >=2 cross-domain).
- A2 resolve_pharmacologic_class via SME annotation override + exemplars lookup.
- A3 FW_down_at_early_timepoint (first 2 scheduled days AND <=14 calendar days).
- A4 audit-trail field emission (c7_suppression_reason, c7_corroboration) WITHOUT enum widening.
- _is_loael_driving_woe end-to-end wiring: C7 corroboration fires LOAEL on
  non-canonical-direction effect when corroborated; C7 suppression blocks
  C1-C5 firing on palatability-rebound pattern.

Not a fixture-against-real-study test (those live in
test_noael_aggregation.py and noael-alg-f5-pointcross). This module
covers the C7 modules' contract surface in isolation; integration with
real PointCross output is verified by re-running the BUG-032/033 fixture
battery (26 tests) which still passes after C7 wiring (back-compat
preserved when sex_findings=None).

Run:
    cd backend && C:/pg/pcc/backend/venv/Scripts/python.exe -m pytest tests/test_c7_corroboration.py -v
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from services.analysis.c7_corroboration import (  # noqa: E402
    evaluate_c7_corroboration,
    evaluate_direction_exception,
)
from services.analysis.c7_predicates import (  # noqa: E402
    evaluate_predicate,
    evaluate_all_of,
    known_predicates,
)


# --- helpers -------------------------------------------------------------


def _bw_finding(direction: str = "up", effect_at_high: float = 0.5):
    """Construct a minimal BW finding with one pairwise at dose 1."""
    return {
        "domain": "BW",
        "endpoint_label": "Body Weight",
        "finding_class": "tr_adverse",
        "direction": direction,
        "data_type": "continuous",
        "sex": "M",
        "day": 91,
        "pairwise": [{
            "dose_level": 1,
            "effect_size": effect_at_high,
            "g_lower": 0.4,
            "p_value": 0.03,
            "p_value_adj": 0.04,
        }],
    }


def _fw_finding(day: int = 7, effect: float = -0.6, dose: int = 1):
    return {
        "domain": "FW",
        "endpoint_label": "Food Consumption",
        "finding_class": "tr_adverse",
        "direction": "down",
        "data_type": "continuous",
        "sex": "M",
        "day": day,
        "pairwise": [{
            "dose_level": dose,
            "effect_size": effect,
            "g_lower": 0.4,
            "p_value": 0.04,
        }],
    }


def _om_finding(direction: str = "up", effect: float = 0.6):
    return {
        "domain": "OM",
        "endpoint_label": "absolute organ weight",
        "specimen": "liver",
        "finding_class": "tr_adverse",
        "direction": direction,
        "data_type": "continuous",
        "sex": "M",
        "day": 91,
        "pairwise": [{"dose_level": 1, "effect_size": effect}],
    }


def _cl_fluid(at_dose: int = 1, incidence: float = 0.5):
    return {
        "domain": "CL",
        "endpoint_label": "clinical observation",
        "finding": "edema, peripheral",
        "finding_term": "edema",
        "finding_class": "tr_adverse",
        "data_type": "incidence",
        "sex": "M",
        "day": 30,
        "group_stats": [{"dose_level": at_dose, "incidence": incidence}],
        "pairwise": [{"dose_level": at_dose, "effect_size": 1.0}],
    }


# --- A1: mechanism vs observation cardinality ----------------------------


def test_a1_mechanism_one_compound_class_flag_corroborates_alone():
    """PPAR-gamma compound class flag alone => corroborated (any-one mechanism)."""
    bw = _bw_finding()  # BW-up (non-canonical: BW canonical adverse is down)
    sex_findings = [bw]
    result = evaluate_c7_corroboration(
        bw, dose_level=1, sex_findings=sex_findings,
        study_compound_class="ppar_gamma_agonist",
    )
    assert result.corroborated is True
    assert "compound_class:ppar_gamma_agonist" in result.mechanism_fires
    assert result.observation_fires == []


def test_a1_observation_one_trigger_alone_NOT_corroborated():
    """Single FW_up trigger insufficient (cross-domain requires >=2)."""
    bw = _bw_finding()
    fw_up = _fw_finding(day=14, effect=+0.5, dose=1)  # FW-up at same dose
    sex_findings = [bw, fw_up]
    result = evaluate_c7_corroboration(
        bw, dose_level=1, sex_findings=sex_findings,
        study_compound_class=None,  # no mechanism
    )
    assert result.corroborated is False
    assert result.observation_fires == ["FW_up_same_dose_sex"]
    assert result.mechanism_fires == []


def test_a1_observation_two_cross_domain_triggers_corroborate():
    """FW_up + OM_organomegaly at same dose => corroborated (>=2 observation)."""
    bw = _bw_finding()
    fw_up = _fw_finding(day=14, effect=+0.5, dose=1)
    om_up = _om_finding(direction="up", effect=+0.6)
    sex_findings = [bw, fw_up, om_up]
    result = evaluate_c7_corroboration(
        bw, dose_level=1, sex_findings=sex_findings,
        study_compound_class=None,
    )
    assert result.corroborated is True
    assert set(result.observation_fires) >= {"FW_up_same_dose_sex", "OM_organomegaly_same_dose_sex"}


def test_a1_observation_fw_plus_cl_fluid_retention_corroborate():
    """FW_up + CL fluid retention at same dose => corroborated."""
    bw = _bw_finding()
    fw_up = _fw_finding(day=14, effect=+0.5, dose=1)
    cl = _cl_fluid(at_dose=1, incidence=0.4)
    result = evaluate_c7_corroboration(
        bw, dose_level=1, sex_findings=[bw, fw_up, cl],
        study_compound_class=None,
    )
    assert result.corroborated is True
    assert "FW_up_same_dose_sex" in result.observation_fires
    assert "CL_fluid_retention_same_dose_sex" in result.observation_fires


def test_a1_class_with_no_triggers_returns_false():
    """CL_incidence has no bidirectional corroboration -> always not corroborated."""
    cl = _cl_fluid(at_dose=1)
    cl["finding"] = "tremor"
    cl["finding_term"] = "tremor"  # not a fluid retention sign
    result = evaluate_c7_corroboration(
        cl, dose_level=1, sex_findings=[cl],
        study_compound_class="ppar_gamma_agonist",
    )
    assert result.corroborated is False


# --- A2: resolve_pharmacologic_class -------------------------------------


def test_a2_exemplars_match_via_treatment_name():
    from services.analysis.compound_class import resolve_pharmacologic_class
    # Pioglitazone is in ppar_gamma_agonist exemplars[]
    result = resolve_pharmacologic_class(
        "_NONEXISTENT_STUDY_FOR_TEST_",
        ts_meta={"treatment": "pioglitazone 30 mg/kg"},
    )
    assert result == "ppar_gamma_agonist"


def test_a2_no_treatment_returns_none():
    from services.analysis.compound_class import resolve_pharmacologic_class
    result = resolve_pharmacologic_class(
        "_NONEXISTENT_STUDY_FOR_TEST_",
        ts_meta={"treatment": "novel-mol-001"},  # no exemplar match
    )
    # Will fall back to TS-fetch which returns no treatment for nonexistent study,
    # so result should be None.
    assert result is None


# --- A3: FW_down_at_early_timepoint --------------------------------------


def test_a3_early_timepoint_first_two_days_under_14():
    """First 2 scheduled FW days both <=14 -> both early."""
    fw_d7 = _fw_finding(day=7, effect=-0.5, dose=1)
    fw_d14 = _fw_finding(day=14, effect=-0.4, dose=1)
    fw_d28 = _fw_finding(day=28, effect=+0.1, dose=1)
    sex_findings = [fw_d7, fw_d14, fw_d28]
    # d7 is in early window
    assert evaluate_predicate(
        "FW_down_at_early_timepoint", fw_d7, dose_level=1, sex_findings=sex_findings,
    ) is True
    # d14 is in early window
    assert evaluate_predicate(
        "FW_down_at_early_timepoint", fw_d14, dose_level=1, sex_findings=sex_findings,
    ) is True
    # d28 is NOT early
    assert evaluate_predicate(
        "FW_down_at_early_timepoint", fw_d28, dose_level=1, sex_findings=sex_findings,
    ) is False


def test_a3_first_two_days_capped_at_14_excludes_late_collection():
    """First 2 collection days are 28 + 56 -> both excluded by <=14 cap (chronic study)."""
    fw_d28 = _fw_finding(day=28, effect=-0.5, dose=1)
    fw_d56 = _fw_finding(day=56, effect=-0.4, dose=1)
    sex_findings = [fw_d28, fw_d56]
    # Neither is early (both > 14)
    assert evaluate_predicate(
        "FW_down_at_early_timepoint", fw_d28, dose_level=1, sex_findings=sex_findings,
    ) is False
    assert evaluate_predicate(
        "FW_down_at_early_timepoint", fw_d56, dose_level=1, sex_findings=sex_findings,
    ) is False


# --- A4: direction-exception suppression + audit-trail emission ----------


def test_a4_palatability_rebound_all_of_fires():
    """FW-down at d7 + recovery at d28 + no BW-down at terminal + no GI CL signs
    => palatability_rebound exception fires; finding_class unchanged.
    """
    fw_d7 = _fw_finding(day=7, effect=-0.6, dose=1)  # down at early
    fw_d28 = _fw_finding(day=28, effect=+0.2, dose=1)  # recovered later
    # No BW finding -> no concurrent BW-down by construction (predicate returns True)
    # No CL findings -> no GI corroboration (predicate returns True)
    sex_findings = [fw_d7, fw_d28]
    suppression = evaluate_direction_exception(fw_d7, dose_level=1, sex_findings=sex_findings)
    assert suppression == "palatability_rebound"


def test_a4_palatability_blocked_by_concurrent_bw_down():
    """Concurrent BW-down at terminal blocks palatability suppression."""
    fw_d7 = _fw_finding(day=7, effect=-0.6, dose=1)
    fw_d28 = _fw_finding(day=28, effect=+0.2, dose=1)
    bw_terminal = _bw_finding()
    bw_terminal["pairwise"] = [{
        "dose_level": 1, "effect_size": -0.7, "p_value": 0.01,
    }]  # BW down at terminal
    bw_terminal["day"] = 91
    bw_terminal["direction"] = "down"
    sex_findings = [fw_d7, fw_d28, bw_terminal]
    suppression = evaluate_direction_exception(fw_d7, dose_level=1, sex_findings=sex_findings)
    assert suppression is None


def test_a4_palatability_blocked_by_gi_cl_signs():
    """CL emesis at same dose blocks palatability suppression."""
    fw_d7 = _fw_finding(day=7, effect=-0.6, dose=1)
    fw_d28 = _fw_finding(day=28, effect=+0.2, dose=1)
    cl_emesis = _cl_fluid(at_dose=1, incidence=0.5)
    cl_emesis["finding"] = "emesis"
    cl_emesis["finding_term"] = "emesis"
    sex_findings = [fw_d7, fw_d28, cl_emesis]
    suppression = evaluate_direction_exception(fw_d7, dose_level=1, sex_findings=sex_findings)
    assert suppression is None


# --- _is_loael_driving_woe end-to-end -----------------------------------


def test_is_loael_driving_woe_c7_corroboration_emits_audit_field():
    """PPAR-gamma class + BW-up + tr_adverse fc => fires via C7 corroboration AND
    emits c7_corroboration audit-trail field. finding_class unchanged.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    bw = _bw_finding(direction="up", effect_at_high=+0.5)
    bw["pairwise"][0]["g_lower"] = 0.1  # too low for C1 => only C7 path
    sex_findings = [bw]
    fired = _is_loael_driving_woe(
        bw, dose_level=1, n_per_group=10, effect_threshold=0.30,
        sex_findings=sex_findings,
        study_pharmacologic_class="ppar_gamma_agonist",
    )
    assert fired is True
    assert "c7_corroboration" in bw
    assert bw["c7_corroboration"]["corroborated"] is True
    assert "compound_class:ppar_gamma_agonist" in bw["c7_corroboration"]["mechanism_fires"]
    # finding_class unchanged (A4 reframe)
    assert bw["finding_class"] == "tr_adverse"


def test_is_loael_driving_woe_c7_suppression_emits_audit_field():
    """FW palatability_rebound suppresses LOAEL-firing AND emits c7_suppression_reason."""
    from generator.view_dataframes import _is_loael_driving_woe
    fw_d7 = _fw_finding(day=7, effect=-0.6, dose=1)
    fw_d7["pairwise"][0]["g_lower"] = 0.5  # would fire C1 absent suppression
    fw_d28 = _fw_finding(day=28, effect=+0.2, dose=1)
    sex_findings = [fw_d7, fw_d28]
    fired = _is_loael_driving_woe(
        fw_d7, dose_level=1, n_per_group=10, effect_threshold=0.30,
        sex_findings=sex_findings,
        study_pharmacologic_class=None,
    )
    assert fired is False
    assert fw_d7.get("c7_suppression_reason") == "palatability_rebound"
    # finding_class unchanged (A4 reframe)
    assert fw_d7["finding_class"] == "tr_adverse"


def test_is_loael_driving_woe_back_compat_when_no_c7_context():
    """When sex_findings=None (legacy callers), C7 silently no-ops; existing
    C1-C5 behavior preserved (regression guard for the 9-call-site plumbing).
    """
    from generator.view_dataframes import _is_loael_driving_woe
    bw = _bw_finding(direction="down", effect_at_high=-0.6)
    bw["pairwise"][0]["g_lower"] = 0.5  # fires C1
    fired = _is_loael_driving_woe(
        bw, dose_level=1, n_per_group=10, effect_threshold=0.30,
    )  # no sex_findings, no study_pharmacologic_class
    assert fired is True
    assert "c7_corroboration" not in bw
    assert "c7_suppression_reason" not in bw


# --- known_predicates registry coverage ----------------------------------


def test_known_predicates_covers_palatability_rebound_all_of():
    """All predicate names cited by palatability_rebound's all_of must be in registry."""
    # The palatability_rebound exception cites these 4 predicates:
    required = {
        "FW_down_at_early_timepoint",
        "FW_recovers_to_baseline_or_above_at_later_timepoint",
        "no_concurrent_BW_down_at_terminal",
        "no_corroborating_CL_signs_GI_emesis_diarrhea",
    }
    assert required <= known_predicates(), (
        f"missing predicates: {required - known_predicates()}"
    )


def test_unknown_predicate_returns_false_failsafe():
    """Unknown predicate name returns False (don't suppress on typo)."""
    fw = _fw_finding()
    assert evaluate_predicate("nonexistent_predicate", fw, 1, [fw]) is False
    assert evaluate_all_of(["nonexistent_predicate"], fw, 1, [fw]) is False
