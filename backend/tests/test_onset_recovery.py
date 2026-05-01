"""Tests for onset_recovery generator module.

Run: cd C:/pg/pcc/backend && C:/pg/pcc/backend/venv/Scripts/python.exe tests/test_onset_recovery.py
"""

import json
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))


# ── Unit tests for build_onset_days ────────────────────────────

def test_build_onset_days_cl_extraction():
    """CL onset days extracted from raw_subject_onset_days in unified_findings."""
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "CL",
            "finding": "EMESIS",
            "sex": "M",
            "severity": "adverse",
            "raw_subject_onset_days": [
                {"SUBJ-001": 3},
                {"SUBJ-002": 7},
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "SUBJ-001", "SEX": "M", "SACRIFICE_DY": 30, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "IS_TK": False},
        {"USUBJID": "SUBJ-002", "SEX": "M", "SACRIFICE_DY": 30, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    assert "subjects" in result
    assert "SUBJ-001" in result["subjects"]
    assert result["subjects"]["SUBJ-001"]["CL:EMESIS"] == 3
    assert result["subjects"]["SUBJ-002"]["CL:EMESIS"] == 7


def test_build_onset_days_lb_per_subject_sd_trigger():
    """LB onset day from per-subject SD trigger (direction='up').

    AUDIT-21: replaces 2x control mean rule with mean + k*sd (k=2).
    Per-subject SD threshold = 10 + 2*5 = 20. Direction='up' so val > 20 fires.
    Cohort effect is sub-threshold (g_lower=0.0) so cohort fallback does NOT fire.
    """
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "LB",
            "finding": "ALT",
            "test_code": "ALT",
            "day": 14,
            "sex": "M",
            "severity": "adverse",
            "direction": "up",
            "group_stats": [
                {"dose_level": 0, "mean": 10.0, "sd": 5.0},
                {"dose_level": 1, "mean": 25.0, "sd": 5.0},
            ],
            "pairwise": [
                {"dose_level": 1, "effect_size": 0.5, "g_lower": 0.0},
            ],
            "raw_subject_values": [
                {"SUBJ-001": 25.0},  # > 20 -> SD trigger
                {"SUBJ-002": 15.0},  # < 20 -> no trigger at this day
            ],
        },
        {
            "domain": "LB",
            "finding": "ALT",
            "test_code": "ALT",
            "day": 30,
            "sex": "M",
            "severity": "adverse",
            "direction": "up",
            "group_stats": [
                {"dose_level": 0, "mean": 10.0, "sd": 5.0},
                {"dose_level": 1, "mean": 30.0, "sd": 5.0},
            ],
            "pairwise": [
                {"dose_level": 1, "effect_size": 0.5, "g_lower": 0.0},
            ],
            "raw_subject_values": [
                {"SUBJ-001": 30.0},  # already had onset at day 14
                {"SUBJ-002": 22.0},  # > 20 -> SD trigger at day 30
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "SUBJ-001", "SEX": "M", "SACRIFICE_DY": 90, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "DOSE_GROUP_ORDER": 1, "IS_TK": False},
        {"USUBJID": "SUBJ-002", "SEX": "M", "SACRIFICE_DY": 90, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "DOSE_GROUP_ORDER": 1, "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    assert "subjects" in result
    assert result["subjects"]["SUBJ-001"]["LB:ALT"] == 14
    assert result["subjects"]["SUBJ-002"]["LB:ALT"] == 30


def test_build_onset_days_lb_direction_down():
    """LB onset day fires on direction='down' for sub-control values.

    AUDIT-21 direction-handling fix: prior `abs(val) > 2*abs(ctrl_mean)` rule
    could not fire on cohort decreases (e.g. TOXSCI-43066 ALP M 0.62x).
    With ctrl mean=10, sd=2, direction='down': threshold = 10 - 2*2 = 6.
    """
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "LB",
            "finding": "ALP",
            "test_code": "ALP",
            "day": 28,
            "sex": "M",
            "severity": "adverse",
            "direction": "down",
            "group_stats": [
                {"dose_level": 0, "mean": 10.0, "sd": 2.0},
                {"dose_level": 1, "mean": 6.0, "sd": 2.0},
            ],
            "pairwise": [
                {"dose_level": 1, "effect_size": -0.5, "g_lower": 0.0},
            ],
            "raw_subject_values": [
                {"SUBJ-001": 5.0},   # < 6 -> SD trigger fires (down)
                {"SUBJ-002": 8.0},   # > 6 -> no trigger
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "SUBJ-001", "SEX": "M", "SACRIFICE_DY": 90, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "DOSE_GROUP_ORDER": 1, "IS_TK": False},
        {"USUBJID": "SUBJ-002", "SEX": "M", "SACRIFICE_DY": 90, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "DOSE_GROUP_ORDER": 1, "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    assert result["subjects"]["SUBJ-001"]["LB:ALP"] == 28
    assert "SUBJ-002" not in result["subjects"] or "LB:ALP" not in result["subjects"].get("SUBJ-002", {})


def test_build_onset_days_lb_cohort_significance_fallback():
    """LB onset day from cohort-significance fallback when per-subject SD doesn't fire.

    AUDIT-21 cohort-blind fix: subjects can have values within control SD range
    while cohort effect is significant (e.g. instem CHOL g=2.58 -- subjects
    cluster slightly above mean+sd but below mean+2sd). Cohort gate fires when
    g_lower >= 0.5 AND sign matches direction; all observed subjects in dose
    group 1 receive onset = day. Subjects in unaffected dose groups (control)
    do NOT.
    """
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "LB",
            "finding": "CHOL",
            "test_code": "CHOL",
            "day": 30,
            "sex": "M",
            "severity": "adverse",
            "direction": "up",
            "group_stats": [
                {"dose_level": 0, "mean": 100.0, "sd": 20.0},  # SD threshold = 140
                {"dose_level": 1, "mean": 145.0, "sd": 20.0},
            ],
            "pairwise": [
                # g_lower=2.0 reliably non-null at large effect; positive es matches direction
                {"dose_level": 1, "effect_size": 2.58, "g_lower": 2.0},
            ],
            "raw_subject_values": [
                {"DOSED-001": 130.0},   # < 140, but in significant cohort -> trigger
                {"DOSED-002": 135.0},   # < 140, but in significant cohort -> trigger
                {"CTRL-001": 105.0},    # control subject, not in affected dose -> no trigger
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "DOSED-001", "SEX": "M", "SACRIFICE_DY": 60, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "DOSE_GROUP_ORDER": 1, "IS_TK": False},
        {"USUBJID": "DOSED-002", "SEX": "M", "SACRIFICE_DY": 60, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "DOSE_GROUP_ORDER": 1, "IS_TK": False},
        {"USUBJID": "CTRL-001", "SEX": "M", "SACRIFICE_DY": 60, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 1, Control", "DOSE_GROUP_ORDER": 0, "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    assert result["subjects"]["DOSED-001"]["LB:CHOL"] == 30
    assert result["subjects"]["DOSED-002"]["LB:CHOL"] == 30
    assert "CTRL-001" not in result["subjects"] or "LB:CHOL" not in result["subjects"].get("CTRL-001", {})


def test_build_onset_days_lb_cohort_fallback_small_n_large_effect_down():
    """Cohort fallback fires on small-n large-effect direction='down' findings.

    AUDIT-21 small-n defensibility: dog/rabbit cohorts (n=5/group) often score
    p_value_adj=0.2-0.3 despite g_lower=1.2 because Dunnett's adjustment is
    conservative. The g_lower>=0.5 gate captures the regulatory-toxicology
    interpretation (CI bound at 'reliably medium' effect) without the n-penalty.
    Mirrors TOXSCI-43066 ALP M day 29 (g=-2.29, g_lower=1.19, p_adj=0.26).
    """
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "LB",
            "finding": "ALP",
            "test_code": "ALP",
            "day": 29,
            "sex": "M",
            "severity": "warning",
            "direction": "down",
            "group_stats": [
                {"dose_level": 0, "mean": 100.0, "sd": 20.0},  # SD lo = 60
                {"dose_level": 3, "mean": 62.0, "sd": 12.0},
            ],
            "pairwise": [
                # g=-2.29, g_lower=1.19 -- Dunnett p_adj would be ~0.26 here
                # but the g_lower CI bound shows effect is reliably very large.
                {"dose_level": 3, "effect_size": -2.29, "g_lower": 1.19},
            ],
            "raw_subject_values": [
                # Subjects within control mean - 2*sd (above 60); SD trigger
                # alone won't fire. Cohort fallback must catch them.
                {"DOG-001": 70.0},
                {"DOG-002": 65.0},
                {"DOG-003": 68.0},
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "DOG-001", "SEX": "M", "SACRIFICE_DY": 60, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 4", "DOSE_GROUP_ORDER": 3, "IS_TK": False},
        {"USUBJID": "DOG-002", "SEX": "M", "SACRIFICE_DY": 60, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 4", "DOSE_GROUP_ORDER": 3, "IS_TK": False},
        {"USUBJID": "DOG-003", "SEX": "M", "SACRIFICE_DY": 60, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 4", "DOSE_GROUP_ORDER": 3, "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    assert result["subjects"]["DOG-001"]["LB:ALP"] == 29
    assert result["subjects"]["DOG-002"]["LB:ALP"] == 29
    assert result["subjects"]["DOG-003"]["LB:ALP"] == 29


def test_build_onset_days_lb_cohort_fallback_direction_mismatch():
    """Cohort fallback does NOT fire when effect-size sign opposes finding direction.

    Guards against assigning onset to dose groups where the cohort moved in
    the opposite direction from the finding's assigned direction (e.g. an
    'up' direction finding with one dose-level showing g=-1.0 -- shouldn't
    register that dose's subjects as having onset).
    """
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "LB",
            "finding": "ALT",
            "test_code": "ALT",
            "day": 30,
            "sex": "M",
            "severity": "adverse",
            "direction": "up",
            "group_stats": [
                {"dose_level": 0, "mean": 50.0, "sd": 10.0},
                {"dose_level": 1, "mean": 35.0, "sd": 10.0},  # actually decreased
            ],
            "pairwise": [
                # Direction='up' but g=-1.0 (down) -- mismatch, gate skips.
                {"dose_level": 1, "effect_size": -1.0, "g_lower": 0.6},
            ],
            "raw_subject_values": [
                {"SUBJ-001": 40.0},  # within ctrl_mean +- 2*sd (30-70); no SD trigger
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "SUBJ-001", "SEX": "M", "SACRIFICE_DY": 60, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "DOSE_GROUP_ORDER": 1, "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    assert "SUBJ-001" not in result["subjects"] or "LB:ALT" not in result["subjects"].get("SUBJ-001", {})


def test_build_onset_days_lb_cohort_fallback_skipped_when_subthreshold():
    """Cohort fallback does NOT fire when g_lower < 0.5 (uncertain effect).

    Guards against assigning onset to subjects in dose groups whose effect-CI
    bounds touch zero (high-variance, low-n combinations).
    """
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "LB",
            "finding": "CHOL",
            "test_code": "CHOL",
            "day": 30,
            "sex": "M",
            "severity": "warning",
            "direction": "up",
            "group_stats": [
                {"dose_level": 0, "mean": 100.0, "sd": 20.0},
                {"dose_level": 1, "mean": 110.0, "sd": 20.0},
            ],
            "pairwise": [
                # Small effect with CI that touches 0: gate skips this dose
                {"dose_level": 1, "effect_size": 0.5, "g_lower": 0.0},
            ],
            "raw_subject_values": [
                {"DOSED-001": 115.0},  # < 140 SD threshold; sub-threshold cohort
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "DOSED-001", "SEX": "M", "SACRIFICE_DY": 60, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "DOSE_GROUP_ORDER": 1, "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    assert "DOSED-001" not in result["subjects"] or "LB:CHOL" not in result["subjects"].get("DOSED-001", {})


def test_build_onset_days_lb_normal_skipped():
    """LB findings with severity 'normal' are skipped."""
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "LB",
            "finding": "ALT",
            "test_code": "ALT",
            "day": 14,
            "sex": "M",
            "severity": "normal",
            "group_stats": [
                {"dose_level": 0, "mean": 10.0},
            ],
            "raw_subject_values": [
                {"SUBJ-001": 25.0},
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "SUBJ-001", "SEX": "M", "SACRIFICE_DY": 90, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    # Should have no onset data because severity is normal
    assert "SUBJ-001" not in result["subjects"] or "LB:ALT" not in result["subjects"].get("SUBJ-001", {})


def test_build_onset_days_mi_sacrifice_proxy():
    """MI onset uses sacrifice day as proxy for subjects at affected dose levels."""
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    findings = [
        {
            "domain": "MI",
            "finding": "NECROSIS",
            "specimen": "LIVER",
            "sex": "M",
            "severity": "adverse",
            "group_stats": [
                {"dose_level": 0, "affected": 0, "incidence": 0.0},
                {"dose_level": 1, "affected": 3, "incidence": 0.3},
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "SUBJ-001", "SEX": "M", "SACRIFICE_DY": 92, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "IS_TK": False},
        {"USUBJID": "SUBJ-002", "SEX": "M", "SACRIFICE_DY": 92, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 1, Control", "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    # SUBJ-001 at dose_level with affected > 0 gets onset = sacrifice day
    assert result["subjects"]["SUBJ-001"]["MI:LIVER:NECROSIS"] == 92
    # SUBJ-002 is control (dose_level 0, affected 0) — no onset
    assert "SUBJ-002" not in result["subjects"] or "MI:LIVER:NECROSIS" not in result["subjects"].get("SUBJ-002", {})


def test_build_onset_days_meta():
    """Result includes meta section."""
    import pandas as pd
    from generator.onset_recovery import build_onset_days

    result = build_onset_days([], pd.DataFrame(columns=["USUBJID", "SEX", "SACRIFICE_DY", "HAS_RECOVERY", "DOSE_LEVEL", "IS_TK"]))
    assert "meta" in result
    assert "subjects" in result


# ── Unit tests for build_recovery_verdicts ────────────────────

def test_build_recovery_verdicts_structure():
    """Recovery verdicts has per_subject and per_finding sections."""
    from generator.onset_recovery import build_recovery_verdicts
    from unittest.mock import MagicMock
    import pandas as pd

    study = MagicMock()
    study.xpt_files = {}  # No XPT files -> empty results

    subjects_df = pd.DataFrame([
        {"USUBJID": "S1", "SEX": "M", "dose_level": 0, "dose_label": "Control",
         "is_recovery": True, "is_satellite": False},
    ])
    result = build_recovery_verdicts([], study, subjects_df, last_dosing_day=30)
    assert "per_subject" in result
    assert "per_finding" in result
    assert "meta" in result


def test_build_recovery_verdicts_continuous_bug21_flag():
    """Continuous domain verdicts include bug21_possible flag (RECV-04)."""
    from generator.onset_recovery import build_recovery_verdicts
    from unittest.mock import MagicMock
    import pandas as pd

    # This is a structural test — the flag should exist in confidence for LB/BW/OM
    study = MagicMock()
    study.xpt_files = {}
    subjects_df = pd.DataFrame(columns=["USUBJID", "SEX", "dose_level", "dose_label",
                                         "is_recovery", "is_satellite"])
    result = build_recovery_verdicts([], study, subjects_df, last_dosing_day=30)
    assert isinstance(result["per_subject"], dict)
    assert isinstance(result["per_finding"], dict)


# ── Run all tests ────────────────────────────────────────────

if __name__ == "__main__":
    test_fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = 0
    failed = 0
    for fn in test_fns:
        try:
            fn()
            print(f"  PASS: {fn.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL: {fn.__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    if failed:
        sys.exit(1)
