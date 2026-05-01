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


# --- DATA-GAP-NOAEL-ALG-22 Phase 3 -------------------------------------
# Layered-gate refactor: _is_biphasic_pairwise unit, Layer 2b/2c paths,
# substantiveness floor, lookup_endpoint_class word-boundary regex,
# magnitude-escape constant invariant.


# Phase 3 fixtures


def _om_down_finding(*, organ: str, sex: str, day: int, dose_g_lower_map: dict):
    """Construct an OM-down finding (non-canonical for OM) with one pairwise
    per dose level. ``dose_g_lower_map`` -> {dose_level: (effect, g_lower)}
    (defaults to p_value=0.20) OR {dose_level: (effect, g_lower, p_value)}
    when a specific p-value is required (e.g., to exercise the path-(a)
    p-significance branch of the substantiveness gate).
    """
    pairwise = []
    for dose, vals in sorted(dose_g_lower_map.items()):
        if len(vals) == 3:
            eff, gl, p = vals
        else:
            eff, gl = vals
            p = 0.20
        pairwise.append({
            "dose_level": dose,
            "effect_size": eff,
            "g_lower": gl,
            "p_value": p,
        })
    return {
        "domain": "OM",
        "endpoint_label": "absolute organ weight",
        "specimen": organ.lower(),
        "organ_system": organ.lower(),
        "finding": f"{organ} weight",
        "finding_class": "tr_adverse",
        "direction": "down",  # non-canonical for OM (canonical = up)
        "data_type": "continuous",
        "sex": sex,
        "day": day,
        "pairwise": pairwise,
    }


def _pt_biphasic_finding():
    """Construct a Prothrombin Time finding with sign-flipping pairwise (the
    PT F PointCross dose-1 Axis-2b case: dose 1 negative effect, dose 2/3
    positive). finding-level direction summarized as 'up' (HD-anchored) but
    the firing-dose-1 effect is negative -> Axis-2b suspension fires.
    """
    return {
        "domain": "LB",
        "endpoint_label": "Prothrombin Time",
        "finding": "Prothrombin Time",
        "finding_class": "tr_adverse",
        "direction": "up",
        "data_type": "continuous",
        "sex": "F",
        "day": 92,
        "pairwise": [
            {"dose_level": 1, "effect_size": -0.5, "g_lower": 0.4, "p_value": 0.04},
            {"dose_level": 2, "effect_size": +0.3, "g_lower": 0.0, "p_value": 0.30},
            {"dose_level": 3, "effect_size": +0.6, "g_lower": 0.4, "p_value": 0.04},
        ],
        "trend_p": 0.05,
    }


def _alt_axis2a_finding():
    """LB ALT M `-,-,+` pattern: pairwise has sign-flips but firing dose 3
    direction (positive) ALIGNS with finding-level direction summary (up).
    Phase-1 enumeration tags this Axis-2a — biphasic shape but HD-aligned;
    must NOT trigger C6 suspension at dose 3.
    """
    return {
        "domain": "LB",
        "endpoint_label": "Alanine Aminotransferase (ALT)",
        "finding": "ALT",
        "finding_class": "tr_adverse",
        "direction": "up",
        "data_type": "continuous",
        "sex": "M",
        "day": 92,
        "pairwise": [
            {"dose_level": 1, "effect_size": -0.4, "g_lower": 0.0, "p_value": 0.40},
            {"dose_level": 2, "effect_size": -0.3, "g_lower": 0.0, "p_value": 0.50},
            {"dose_level": 3, "effect_size": +1.2, "g_lower": 0.6, "p_value": 0.02},
        ],
        "trend_p": 0.04,
    }


# Phase 3.1: _is_biphasic_pairwise unit (null + zero edges per peer-review F3)


def test_phase3_biphasic_helper_positive_negative_alternation():
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([
        {"effect_size": +1}, {"effect_size": -1}, {"effect_size": +1},
    ]) is True


def test_phase3_biphasic_helper_negative_positive_alternation():
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([
        {"effect_size": -1}, {"effect_size": +1}, {"effect_size": -1},
    ]) is True


def test_phase3_biphasic_helper_neg_pos_pos_is_biphasic():
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([
        {"effect_size": -1}, {"effect_size": +1}, {"effect_size": +1},
    ]) is True


def test_phase3_biphasic_helper_pos_neg_neg_is_biphasic():
    """Spec §1c test table line 434 explicitly lists [+, -, -] as required True."""
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([
        {"effect_size": +1}, {"effect_size": -1}, {"effect_size": -1},
    ]) is True


def test_phase3_biphasic_helper_pos_zero_neg_with_zero_skipped():
    from generator.view_dataframes import _is_biphasic_pairwise
    # one zero ignored, one each sign — biphasic
    assert _is_biphasic_pairwise([
        {"effect_size": +1}, {"effect_size": 0}, {"effect_size": -1},
    ]) is True


def test_phase3_biphasic_helper_null_pos_neg_with_null_skipped():
    from generator.view_dataframes import _is_biphasic_pairwise
    # null skipped, one each sign — biphasic
    assert _is_biphasic_pairwise([
        {"effect_size": None}, {"effect_size": +1}, {"effect_size": -1},
    ]) is True


def test_phase3_biphasic_helper_all_positive_not_biphasic():
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([
        {"effect_size": +1}, {"effect_size": +1}, {"effect_size": +1},
    ]) is False


def test_phase3_biphasic_helper_all_negative_not_biphasic():
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([
        {"effect_size": -1}, {"effect_size": -1}, {"effect_size": -1},
    ]) is False


def test_phase3_biphasic_helper_zero_pos_pos_not_biphasic():
    from generator.view_dataframes import _is_biphasic_pairwise
    # zero ignored, single sign across non-zero entries
    assert _is_biphasic_pairwise([
        {"effect_size": 0}, {"effect_size": +1}, {"effect_size": +1},
    ]) is False


def test_phase3_biphasic_helper_null_pos_pos_not_biphasic():
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([
        {"effect_size": None}, {"effect_size": +1}, {"effect_size": +1},
    ]) is False


def test_phase3_biphasic_helper_null_null_pos_not_biphasic():
    from generator.view_dataframes import _is_biphasic_pairwise
    # single sign across non-null entries
    assert _is_biphasic_pairwise([
        {"effect_size": None}, {"effect_size": None}, {"effect_size": +1},
    ]) is False


def test_phase3_biphasic_helper_empty_not_biphasic():
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([]) is False


def test_phase3_biphasic_helper_all_null_not_biphasic():
    from generator.view_dataframes import _is_biphasic_pairwise
    assert _is_biphasic_pairwise([
        {"effect_size": None}, {"effect_size": None}, {"effect_size": None},
    ]) is False


# Phase 3.2: Layer 2b — C6 biphasic suspension


def test_phase3_layer2b_biphasic_suspension_fires_on_axis2b():
    """PT F PointCross dose-1: pairwise sign-flips AND firing-dose-1 effect
    direction (negative) does NOT match finding-level direction (up).
    Layer 2b suspends; audit field emitted.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    pt = _pt_biphasic_finding()
    fired = _is_loael_driving_woe(
        pt, dose_level=1, n_per_group=10,
        sex_findings=[pt],
        study_pharmacologic_class=None,
    )
    assert fired is False
    assert "c6_biphasic_suspension" in pt
    assert pt["c6_biphasic_suspension"]["firing_dose_level"] == 1
    assert pt["c6_biphasic_suspension"]["finding_direction"] == "up"
    assert pt["c6_biphasic_suspension"]["firing_dose_effect"] == -0.5


def test_phase3_layer2b_biphasic_does_not_suspend_axis2a_hd():
    """LB ALT M `-,-,+`: dose 3 firing direction (positive) MATCHES
    finding-level direction (up). C6 path falls through; Layer 3 C1 fires.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    alt = _alt_axis2a_finding()
    fired = _is_loael_driving_woe(
        alt, dose_level=3, n_per_group=10, effect_threshold=0.30,
        sex_findings=[alt],
        study_pharmacologic_class=None,
    )
    assert fired is True
    # Axis-2a HD-only fire — the biphasic shape was sub-threshold low-dose
    # noise; suspension must NOT fire at dose 3.
    assert "c6_biphasic_suspension" not in alt


# Phase 3.3: Layer 2c paths (a)/(b)/(c)


def test_phase3_layer2c_path_a_corroborated_fires_loael():
    """BW-up + fc=equivocal blocks Layer 3, but substantive FW-up + OM-up
    corroboration at the same dose fires LOAEL via path (a). Audit field
    c7_corroboration set.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    bw = _bw_finding(direction="up", effect_at_high=+0.5)
    bw["finding_class"] = "equivocal"  # blocks Layer 3 C1
    bw["pairwise"][0]["g_lower"] = 0.1  # blocks magnitude-escape too
    bw["trend_p"] = 0.50  # blocks C2b
    # Substantive corroborators at dose 1 (clear substantiveness floor)
    fw_up = _fw_finding(day=14, effect=+1.0, dose=1)
    fw_up["pairwise"][0]["g_lower"] = 0.5
    om_up = _om_finding(direction="up", effect=+1.0)
    om_up["pairwise"][0]["g_lower"] = 0.5
    fired = _is_loael_driving_woe(
        bw, dose_level=1, n_per_group=10,
        sex_findings=[bw, fw_up, om_up],
        study_pharmacologic_class=None,
    )
    assert fired is True
    assert bw.get("c7_corroboration", {}).get("corroborated") is True
    obs = set(bw["c7_corroboration"]["observation_fires"])
    assert {"FW_up_same_dose_sex", "OM_organomegaly_same_dose_sex"} <= obs
    assert "c7_magnitude_escape" not in bw


def test_phase3_layer2c_path_b_magnitude_escape_falls_through_to_layer3():
    """OM HEART M dose 3 (g_lower=2.046 from PointCross): non-corroborated
    (no atrophy at HEART) but g_lower clears the 0.7 escape threshold —
    falls through to Layer 3 where C1 fires (tr_adverse + g_lower>0.3 +
    direction match).
    """
    from generator.view_dataframes import _is_loael_driving_woe
    heart = _om_down_finding(
        organ="HEART", sex="M", day=92,
        dose_g_lower_map={1: (-0.10, 0.435), 2: (-0.12, 0.454), 3: (-2.10, 2.046)},
    )
    fired = _is_loael_driving_woe(
        heart, dose_level=3, n_per_group=10, effect_threshold=0.30,
        sex_findings=[heart],
        study_pharmacologic_class=None,
    )
    assert fired is True
    esc = heart.get("c7_magnitude_escape")
    assert esc is not None
    assert esc["g_lower"] == 2.046
    assert esc["threshold"] == 0.7
    # Path (b) does NOT emit c7_corroboration (corroboration was non-corroborated)
    assert "c7_corroboration" not in heart


def test_phase3_layer2c_path_c_sub_magnitude_blocks_loael():
    """OM HEART M dose 1 (g_lower=0.435): non-corroborated AND below 0.7 —
    blocks LOAEL unconditionally. Audit c7_corroboration_blocked.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    heart = _om_down_finding(
        organ="HEART", sex="M", day=92,
        dose_g_lower_map={1: (-0.10, 0.435), 2: (-0.12, 0.454), 3: (-2.10, 2.046)},
    )
    fired = _is_loael_driving_woe(
        heart, dose_level=1, n_per_group=10, effect_threshold=0.30,
        sex_findings=[heart],
        study_pharmacologic_class=None,
    )
    assert fired is False
    blocked = heart.get("c7_corroboration_blocked")
    assert blocked is not None
    assert "insufficient evidence" in blocked["rationale"]
    assert "c7_corroboration" not in heart
    assert "c7_magnitude_escape" not in heart


def test_phase3_layer2c_canonical_direction_skips_layer2c():
    """LB Leukocytes M up (canonical-direction LB; no class-level direction
    canonicality registered for LB_per_analyte) — Layer 2c short-circuits
    via fast-path (corroboration_triggers returns []); proceeds to Layer 3.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    lb = {
        "domain": "LB",
        "endpoint_label": "Leukocytes",
        "finding": "Leukocytes",
        "finding_class": "tr_adverse",
        "direction": "up",
        "data_type": "continuous",
        "sex": "M",
        "day": 92,
        "pairwise": [{
            "dose_level": 1, "effect_size": +1.5,
            "g_lower": 1.060, "p_value": 0.03,
        }],
    }
    fired = _is_loael_driving_woe(
        lb, dose_level=1, n_per_group=10, effect_threshold=0.30,
        sex_findings=[lb],
        study_pharmacologic_class=None,
    )
    assert fired is True
    # No Layer-2c audit fields (skipped via fast-path)
    assert "c7_corroboration" not in lb
    assert "c7_corroboration_blocked" not in lb
    assert "c7_magnitude_escape" not in lb


# Phase 3.4: Substantiveness floor (AR-7) — _has_class_direction_at_dose


def test_phase3_substantiveness_floor_rejects_noise_at_dose1():
    """BG M day-92 noise rejection: FC effect=+0.030 g_lower=0.0 must NOT
    fire FW_up trigger; SPLEEN effect=+0.212 g_lower=0.0 must NOT fire
    OM_up trigger. The pre-patch behavior (sign-only check) admitted both.
    """
    from services.analysis.c7_corroboration import _has_class_direction_at_dose
    fc_noise = {
        "domain": "FW",
        "endpoint_label": "food consumption",
        "pairwise": [{"dose_level": 1, "effect_size": +0.030, "g_lower": 0.0}],
    }
    om_noise = {
        "domain": "OM",
        "endpoint_label": "absolute organ weight",
        "specimen": "spleen",
        "pairwise": [{"dose_level": 1, "effect_size": +0.212, "g_lower": 0.0}],
    }
    assert _has_class_direction_at_dose([fc_noise], "FW", 1, "up") is False
    assert _has_class_direction_at_dose([om_noise], "OM", 1, "up") is False


def test_phase3_substantiveness_floor_admits_substantive_g_lower():
    """g_lower > 0.3 (default threshold) admits the trigger as evidence."""
    from services.analysis.c7_corroboration import _has_class_direction_at_dose
    fw_real = {
        "domain": "FW",
        "endpoint_label": "food consumption",
        "pairwise": [{"dose_level": 1, "effect_size": +0.5, "g_lower": 0.5}],
    }
    assert _has_class_direction_at_dose([fw_real], "FW", 1, "up") is True


def test_phase3_substantiveness_floor_g_lower_at_threshold_excluded():
    """Strict inequality: g_lower == 0.3 does NOT clear (matches C1's > 0.3)."""
    from services.analysis.c7_corroboration import _has_class_direction_at_dose
    fw_boundary = {
        "domain": "FW",
        "endpoint_label": "food consumption",
        "pairwise": [{"dose_level": 1, "effect_size": +0.5, "g_lower": 0.3}],
    }
    assert _has_class_direction_at_dose([fw_boundary], "FW", 1, "up") is False


def test_phase3_substantiveness_floor_cohen_d_fallback_when_g_lower_none():
    """g_lower is None branch: |effect_size| >= 0.5 admits as defensive
    fallback for incidence-only / missing-CI cases.
    """
    from services.analysis.c7_corroboration import _has_class_direction_at_dose
    fw_fallback_pass = {
        "domain": "FW",
        "endpoint_label": "food consumption",
        "pairwise": [{"dose_level": 1, "effect_size": +0.7, "g_lower": None}],
    }
    fw_fallback_below = {
        "domain": "FW",
        "endpoint_label": "food consumption",
        "pairwise": [{"dose_level": 1, "effect_size": +0.3, "g_lower": None}],
    }
    assert _has_class_direction_at_dose([fw_fallback_pass], "FW", 1, "up") is True
    assert _has_class_direction_at_dose([fw_fallback_below], "FW", 1, "up") is False


def test_phase3_layer2c_path_c_blocks_bg_m_day92_metabolic_syndrome_noise():
    """PointCross BG M day-92 regression: pre-patch admitted FC effect=+0.030
    + SPLEEN effect=+0.212 as corroboration (sign-only mechanical fires);
    post-patch substantiveness floor rejects both, Layer 2c path (c) fires
    with c7_corroboration_blocked rationale "insufficient evidence
    (mechanism=0, observation=0/2)".
    """
    from generator.view_dataframes import _is_loael_driving_woe
    bg = _bw_finding(direction="up", effect_at_high=+0.234)
    bg["finding"] = "Body Weight Gain"
    bg["endpoint_label"] = "Body Weight Gain"
    bg["finding_class"] = "equivocal"  # PointCross BG M day-92 fc
    bg["pairwise"][0]["effect_size"] = +0.234
    bg["pairwise"][0]["g_lower"] = 0.234  # below 0.7 escape threshold
    fc_noise = _fw_finding(day=14, effect=+0.030, dose=1)
    fc_noise["pairwise"][0]["g_lower"] = 0.0
    om_spleen_noise = _om_finding(direction="up", effect=+0.212)
    om_spleen_noise["pairwise"][0]["g_lower"] = 0.0
    om_spleen_noise["specimen"] = "spleen"
    fired = _is_loael_driving_woe(
        bg, dose_level=1, n_per_group=10, effect_threshold=0.30,
        sex_findings=[bg, fc_noise, om_spleen_noise],
        study_pharmacologic_class=None,
    )
    assert fired is False
    blocked = bg.get("c7_corroboration_blocked")
    assert blocked is not None
    assert blocked["mechanism_fires"] == []
    assert blocked["observation_fires"] == []
    assert "insufficient evidence" in blocked["rationale"]


# Phase 3.4b: Same-organ pathology = mechanism (single fire corroborates)


def test_phase3_same_organ_pathology_single_fire_corroborates():
    """OM TESTIS M dose 1 with single MI_atrophy_same_organ_same_dose_sex
    fire must corroborate (mechanism path, any-one suffices). Same-organ
    pathology is direct mechanistic evidence; the >=2 cardinality rule
    applies only to cross-domain coincidence-permissive triggers.
    """
    om_testis = {
        "domain": "OM",
        "endpoint_label": "absolute organ weight",
        "specimen": "testis",
        "organ_system": "testis",
        "finding": "TESTIS weight",
        "finding_class": "tr_adverse",
        "direction": "down",
        "data_type": "continuous",
        "sex": "M",
        "day": 92,
        "pairwise": [{"dose_level": 1, "effect_size": -0.92, "g_lower": 0.51}],
    }
    mi_atrophy = {
        "domain": "MI",
        "endpoint_label": "microscopic finding",
        "specimen": "testis",
        "organ_system": "testis",
        "finding": "atrophy",
        "finding_term": "atrophy, tubular",
        "finding_class": "tr_adverse",
        "data_type": "incidence",
        "sex": "M",
        "day": 92,
        "group_stats": [{"dose_level": 1, "incidence": 0.4}],
        "pairwise": [{"dose_level": 1, "effect_size": 0.4}],
    }
    sex_findings = [om_testis, mi_atrophy]
    result = evaluate_c7_corroboration(
        om_testis, dose_level=1, sex_findings=sex_findings,
        study_compound_class=None,
    )
    assert result.corroborated is True, (
        f"Expected corroborated=True; got rationale={result.rationale}"
    )
    assert "MI_atrophy_same_organ_same_dose_sex" in result.mechanism_fires


def test_phase3_same_organ_mechanism_does_not_promote_cross_domain():
    """Cross-domain triggers (no _same_organ_) still require >=2 fires even
    after the same-organ mechanism rule. Single FW_up_same_dose_sex must
    NOT corroborate BW-up alone.
    """
    bw = _bw_finding(direction="up", effect_at_high=+0.5)
    fw_up = _fw_finding(day=14, effect=+0.5, dose=1)
    result = evaluate_c7_corroboration(
        bw, dose_level=1, sex_findings=[bw, fw_up],
        study_compound_class=None,
    )
    assert result.corroborated is False
    assert result.mechanism_fires == []
    assert "FW_up_same_dose_sex" in result.observation_fires


# Phase 3.5: lookup_endpoint_class word-boundary regex (BUG-035)


def test_phase3_lookup_endpoint_class_regex_rejects_om_in_prothrombin():
    """Pre-patch: 'om' substring matched 'prothrombin' (om inside rOMbin) —
    PT findings spuriously routed to OM class. Post-patch: word boundary
    blocks the spurious match.
    """
    from services.analysis.endpoint_adverse_direction import lookup_endpoint_class
    # No send_domain (worst case for substring fallback): must NOT return OM
    assert lookup_endpoint_class("Prothrombin Time", send_domain=None) != "OM"
    assert lookup_endpoint_class("Prothrombin Time", send_domain=None) != "FW"
    assert lookup_endpoint_class("Prothrombin Time", send_domain=None) != "BW"


def test_phase3_lookup_endpoint_class_regex_long_pattern_still_matches():
    """Long pattern 'body weight gain' must still match (word boundaries
    are present at both ends of multi-word patterns).
    """
    from services.analysis.endpoint_adverse_direction import lookup_endpoint_class
    assert lookup_endpoint_class("Body Weight Gain", send_domain=None) == "BW"
    assert lookup_endpoint_class("Terminal Body Weight", send_domain=None) == "BW"


def test_phase3_lookup_endpoint_class_regex_bare_om_at_word_boundary_matches():
    """'OM' at left word boundary still matches OM class."""
    from services.analysis.endpoint_adverse_direction import lookup_endpoint_class
    assert lookup_endpoint_class("OM Kidney Weight", send_domain=None) == "OM"


def test_phase3_lookup_endpoint_class_regex_rejects_fc_in_uniform():
    """'fc' substring inside 'uniform charge' (and similar) must not match."""
    from services.analysis.endpoint_adverse_direction import lookup_endpoint_class
    assert lookup_endpoint_class("uniform charge", send_domain=None) != "FW"


# Phase 3.6: Magnitude-escape constant invariant (architect-review §1.4a #1)


def test_phase3_magnitude_escape_constant_value_invariant():
    """The named module-level constant exposes the threshold for credentialed-
    reviewer audit (CLAUDE.md rule 21). Single source of truth — test
    asserts both the constant value and that the audit field's threshold
    matches the constant (no drift between them).
    """
    from generator.view_dataframes import (
        _is_loael_driving_woe,
        _MAGNITUDE_ESCAPE_GLOWER_THRESHOLD,
    )
    assert _MAGNITUDE_ESCAPE_GLOWER_THRESHOLD == 0.7
    # Trigger Path (b) and confirm the audit field's threshold equals the
    # constant — guards against drift if someone hard-codes the literal.
    heart = _om_down_finding(
        organ="HEART", sex="M", day=92,
        dose_g_lower_map={1: (-0.10, 0.435), 3: (-2.10, 2.046)},
    )
    _is_loael_driving_woe(
        heart, dose_level=3, n_per_group=10, effect_threshold=0.30,
        sex_findings=[heart],
        study_pharmacologic_class=None,
    )
    assert heart["c7_magnitude_escape"]["threshold"] == _MAGNITUDE_ESCAPE_GLOWER_THRESHOLD


# Phase 3.7: Peer-review R1+R2 fixes — NTR/normal corroborator filter +
# Layer 2c path (a) primary substantiveness gate. Both surfaced during
# the algorithm-defensibility check on PointCross.


def test_phase3_ntr_filter_excludes_not_treatment_related_corroborator():
    """Peer-review R1 Finding 1: a corroborating finding classified as
    `not_treatment_related` cannot serve as treatment-related corroboration.
    PointCross MI TESTIS ATROPHY M is fc=NTR at dose 1 (1/10) — must NOT
    corroborate OM TESTIS-down M dose 1 even though incidence > 0.
    """
    from services.analysis.c7_corroboration import _has_pathology_at_dose_same_organ
    mi_atrophy_ntr = {
        "domain": "MI",
        "specimen": "testis",
        "organ_system": "testis",
        "finding": "ATROPHY",
        "finding_term": "atrophy",
        "finding_class": "not_treatment_related",
        "data_type": "incidence",
        "sex": "M",
        "day": 92,
        "group_stats": [{"dose_level": 1, "incidence": 0.1}],
    }
    assert _has_pathology_at_dose_same_organ(
        sex_findings=[mi_atrophy_ntr],
        target_domain="MI",
        keywords=("atrophy", "atrophic", "depletion", "hypoplasia"),
        organ_id="testis",
        dose_level=1,
    ) is False


def test_phase3_ntr_filter_admits_equivocal_corroborator():
    """NTR filter blocks ONLY `not_treatment_related` and `normal`;
    treatment-related classifications (tr_adverse, treatment_related_concerning,
    equivocal) remain valid corroborators. PointCross MI KIDNEY NECROSIS M
    is fc=equivocal — must corroborate.
    """
    from services.analysis.c7_corroboration import _has_pathology_at_dose_same_organ
    mi_necrosis_eq = {
        "domain": "MI",
        "specimen": "kidney",
        "organ_system": "kidney",
        "finding": "NECROSIS",
        "finding_term": "necrosis",
        "finding_class": "equivocal",
        "data_type": "incidence",
        "sex": "M",
        "day": 92,
        "group_stats": [{"dose_level": 1, "incidence": 0.3}],
    }
    assert _has_pathology_at_dose_same_organ(
        sex_findings=[mi_necrosis_eq],
        target_domain="MI",
        keywords=("necrosis", "necrotic"),
        organ_id="kidney",
        dose_level=1,
    ) is True


def test_phase3_ntr_filter_excludes_normal_corroborator():
    """R2 Finding 1 scope extension: `normal` finding_class also excluded.
    A finding classified `normal` is by definition not pathological evidence.
    """
    from services.analysis.c7_corroboration import _has_pathology_at_dose_same_organ
    mi_normal = {
        "domain": "MI",
        "specimen": "kidney",
        "organ_system": "kidney",
        "finding": "NORMAL",
        "finding_term": "no significant findings",
        "finding_class": "normal",
        "data_type": "incidence",
        "sex": "M",
        "day": 92,
        "group_stats": [{"dose_level": 1, "incidence": 0.5}],
    }
    assert _has_pathology_at_dose_same_organ(
        sex_findings=[mi_normal],
        target_domain="MI",
        keywords=("necrosis", "necrotic", "normal"),
        organ_id="kidney",
        dose_level=1,
    ) is False


def test_phase3_ntr_filter_cl_keyword_excludes_ntr_and_normal():
    """CL_incidence corroborators with fc in {not_treatment_related, normal}
    are excluded (parallel to MA/MI filter).
    """
    from services.analysis.c7_corroboration import _has_cl_keyword_with_incidence
    cl_edema_ntr = {
        "domain": "CL",
        "endpoint_label": "clinical observation",
        "finding": "edema, peripheral",
        "finding_term": "edema",
        "finding_class": "not_treatment_related",
        "data_type": "incidence",
        "sex": "M",
        "day": 30,
        "group_stats": [{"dose_level": 1, "incidence": 0.4}],
        "pairwise": [{"dose_level": 1, "effect_size": 1.0}],
    }
    cl_edema_normal = dict(cl_edema_ntr, finding_class="normal")
    assert _has_cl_keyword_with_incidence(
        sex_findings=[cl_edema_ntr],
        keywords=("edema", "oedema", "swelling"),
        dose_level=1,
    ) is False
    assert _has_cl_keyword_with_incidence(
        sex_findings=[cl_edema_normal],
        keywords=("edema", "oedema", "swelling"),
        dose_level=1,
    ) is False


def test_phase3_path_a_blocks_when_primary_below_substantiveness_floor():
    """Peer-review R1 Finding 2: path (a) cannot fire LOAEL on corroboration
    alone when the primary finding has neither biological NOR statistical
    signal. PointCross KIDNEY OM M dose 1 (g_lower=0.013, p=0.599) fires
    path (a) via equivocal MI_necrosis pre-fix — non-significant essentially-
    zero effect with corroboration is algorithmically indefensible. Post-fix
    requires `g_lower > effect_threshold` (default 0.3) OR `p < 0.10` on
    the primary finding before path (a) fires.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    kidney = _om_down_finding(
        organ="KIDNEY", sex="M", day=92,
        dose_g_lower_map={1: (-0.399, 0.013, 0.599), 3: (-2.10, 1.619, 1e-06)},
    )
    mi_necrosis = {
        "domain": "MI",
        "specimen": "kidney",
        "organ_system": "kidney",
        "finding": "NECROSIS",
        "finding_term": "necrosis",
        "finding_class": "equivocal",
        "data_type": "incidence",
        "sex": "M",
        "day": 92,
        "group_stats": [{"dose_level": 1, "incidence": 0.3}],
    }
    fired = _is_loael_driving_woe(
        kidney, dose_level=1, n_per_group=10, effect_threshold=0.30,
        sex_findings=[kidney, mi_necrosis],
        study_pharmacologic_class=None,
    )
    assert fired is False, (
        "KIDNEY M dose 1 g_lower=0.013 p=0.599 must NOT fire LOAEL despite "
        "MI_necrosis corroboration (primary substantiveness gate)"
    )
    blocked = kidney.get("c7_corroboration_blocked")
    assert blocked is not None
    assert "primary g_lower" in blocked["rationale"]
    assert "substantiveness floor" in blocked["rationale"]
    assert "MI_necrosis_same_organ_same_dose_sex" in blocked["mechanism_fires"]


def test_phase3_path_a_fires_when_primary_g_lower_clears_floor():
    """TESTIS M dose 1 g_lower=0.512 > 0.3 + p=0.038 < 0.10 + treatment-
    related corroboration fires LOAEL via path (a). Either criterion alone
    suffices.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    testis = _om_down_finding(
        organ="TESTIS", sex="M", day=92,
        dose_g_lower_map={1: (-0.92, 0.512, 0.038), 3: (-1.67, 1.21, 0.004)},
    )
    mi_atrophy_tr = {
        "domain": "MI",
        "specimen": "testis",
        "organ_system": "testis",
        "finding": "ATROPHY",
        "finding_term": "atrophy",
        "finding_class": "tr_adverse",
        "data_type": "incidence",
        "sex": "M",
        "day": 92,
        "group_stats": [{"dose_level": 1, "incidence": 0.4}],
    }
    fired = _is_loael_driving_woe(
        testis, dose_level=1, n_per_group=10, effect_threshold=0.30,
        sex_findings=[testis, mi_atrophy_tr],
        study_pharmacologic_class=None,
    )
    assert fired is True
    assert testis.get("c7_corroboration", {}).get("corroborated") is True
    assert "MI_atrophy_same_organ_same_dose_sex" in testis["c7_corroboration"]["mechanism_fires"]


def test_phase3_path_a_fires_when_primary_p_significant_even_low_g_lower():
    """Substantiveness gate is OR-criteria: primary `p < 0.10` admits path
    (a) even when g_lower is below 0.3 (biological-evidence threshold).
    Honors OECD TG 408 §5.4.1 "statistical and/or biological significance".
    """
    from generator.view_dataframes import _is_loael_driving_woe
    bw = _bw_finding(direction="up", effect_at_high=+0.5)
    bw["finding_class"] = "equivocal"  # block Layer 3
    bw["pairwise"][0]["g_lower"] = 0.1  # below biological threshold
    bw["pairwise"][0]["p_value"] = 0.04  # but statistically significant
    bw["pairwise"][0]["p_value_adj"] = 0.05
    bw["trend_p"] = 0.50  # block C2b
    fw_up = _fw_finding(day=14, effect=+1.0, dose=1)
    fw_up["pairwise"][0]["g_lower"] = 0.5
    om_up = _om_finding(direction="up", effect=+1.0)
    om_up["pairwise"][0]["g_lower"] = 0.5
    fired = _is_loael_driving_woe(
        bw, dose_level=1, n_per_group=10,
        sex_findings=[bw, fw_up, om_up],
        study_pharmacologic_class=None,
    )
    assert fired is True
    assert bw.get("c7_corroboration", {}).get("corroborated") is True


def test_phase3_path_a_loose_significance_constant_invariant():
    """R2 F2 rule-22 compliance: the loose-significance threshold is exposed
    as a named module-level constant for credentialed-reviewer audit, anchored
    to NOAEL-FACT-022 in the typed knowledge graph.
    """
    from generator.view_dataframes import _PATH_A_LOOSE_SIGNIFICANCE_P
    assert _PATH_A_LOOSE_SIGNIFICANCE_P == 0.10


def test_phase3_path_a_incidence_findings_bypass_substantiveness_floor():
    """Incidence findings (g_lower=None) bypass the path-(a) substantiveness
    gate — Layer 3 C4/C5 evaluate incidence rate independently. Same-organ
    MI_necrosis corroboration fires path (a) on a small-incidence OM finding.
    """
    from generator.view_dataframes import _is_loael_driving_woe
    om_inc = {
        "domain": "OM",
        "endpoint_label": "absolute organ weight",
        "specimen": "liver",
        "organ_system": "liver",
        "finding": "tumor mass",
        "finding_class": "tr_adverse",
        "direction": "down",
        "data_type": "incidence",
        "sex": "M",
        "day": 92,
        "group_stats": [{"dose_level": 1, "incidence": 0.2}],
        "pairwise": [{"dose_level": 1, "effect_size": -0.4, "g_lower": None}],
    }
    mi_necrosis = {
        "domain": "MI",
        "specimen": "liver",
        "organ_system": "liver",
        "finding": "NECROSIS",
        "finding_term": "necrosis",
        "finding_class": "tr_adverse",
        "data_type": "incidence",
        "sex": "M",
        "day": 92,
        "group_stats": [{"dose_level": 1, "incidence": 0.3}],
    }
    fired = _is_loael_driving_woe(
        om_inc, dose_level=1, n_per_group=10, effect_threshold=0.30,
        sex_findings=[om_inc, mi_necrosis],
        study_pharmacologic_class=None,
    )
    assert fired is True
    assert om_inc.get("c7_corroboration", {}).get("corroborated") is True
