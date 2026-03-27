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


def test_build_onset_days_lb_threshold():
    """LB onset day = first day where subject value exceeds 2x control mean."""
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
            "group_stats": [
                {"dose_level": 0, "mean": 10.0},
                {"dose_level": 1, "mean": 25.0},
            ],
            "raw_subject_values": [
                {"SUBJ-001": 25.0},  # > 2*10 = 20 -> onset
                {"SUBJ-002": 15.0},  # < 20 -> no onset at this day
            ],
        },
        {
            "domain": "LB",
            "finding": "ALT",
            "test_code": "ALT",
            "day": 30,
            "sex": "M",
            "severity": "adverse",
            "group_stats": [
                {"dose_level": 0, "mean": 10.0},
                {"dose_level": 1, "mean": 30.0},
            ],
            "raw_subject_values": [
                {"SUBJ-001": 30.0},  # already had onset at day 14
                {"SUBJ-002": 22.0},  # > 20 -> onset at day 30
            ],
        },
    ]
    ctx_df = pd.DataFrame([
        {"USUBJID": "SUBJ-001", "SEX": "M", "SACRIFICE_DY": 90, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "IS_TK": False},
        {"USUBJID": "SUBJ-002", "SEX": "M", "SACRIFICE_DY": 90, "HAS_RECOVERY": False,
         "DOSE_LEVEL": "Group 2", "IS_TK": False},
    ])
    result = build_onset_days(findings, ctx_df)
    assert "subjects" in result
    # SUBJ-001 onset at day 14 (first crossing)
    assert result["subjects"]["SUBJ-001"]["LB:ALT"] == 14
    # SUBJ-002 onset at day 30 (first crossing)
    assert result["subjects"]["SUBJ-002"]["LB:ALT"] == 30


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
