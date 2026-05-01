"""Vocab-fix regression tests for HISTOPATH_RULES (AUDIT-25).

Locks the gross-MA-term vocabulary additions made under AUDIT-25 against
INHAND/STP citations. Each test pins a specific (rule, finding, organ)
triple so that future rule edits can't silently drop the macroscopic
correlate without breaking a test.

Citations (in code comments at the rule sites in subject_syndromes.py):
  - Willard-Mack et al. 2019 INHAND hematolymphoid (Tox Path 47:665-783)
  - ICH S8 Immunotoxicity Studies for Human Pharmaceuticals (2005)
  - Hall et al. 2012 ESTP Liver Hypertrophy (Tox Path 40:971-994)
  - Yoshitomi et al. 2018 INHAND endocrine
  - Frazier et al. 2012 INHAND urinary system
  - van Meer et al. 2016 oligonucleotide injection-site reactions
"""
from __future__ import annotations

from generator.subject_syndromes import (
    HISTOPATH_RULES,
    _evaluate_histopath_syndrome,
)


def _rule(syndrome_id: str) -> dict:
    return next(r for r in HISTOPATH_RULES if r["syndrome_id"] == syndrome_id)


def _ma(specimen: str, finding: str, sev_grade: int = 0) -> dict:
    return {"specimen": specimen, "finding": finding, "severity": None, "severity_grade": sev_grade}


def test_lymphoid_depletion_fires_on_gross_thymus_small():
    """Nimble pattern: MA THYMUS Small (gross necropsy) is the macroscopic
    correlate of microscopic thymic atrophy / lymphoid depletion.
    INHAND-aligned (Willard-Mack 2019) + ICH S8 §4.1."""
    rule = _rule("lymphoid_depletion")
    result = _evaluate_histopath_syndrome(
        "S1", "M", False, rule,
        subject_mi={},
        subject_ma={"S1": [_ma("THYMUS", "Small")]},
        om_fold_changes={},
    )
    assert result is not None, "lymphoid_depletion should match THYMUS Small after AUDIT-25 vocab fix"
    assert result["match_type"] == "full"
    assert any(m["finding"] == "Small" for m in result["matched_required"])


def test_lymphoid_depletion_fires_on_gross_spleen_small():
    """Same INHAND-cited principle extends to gross 'Small spleen' for
    splenic atrophy / lymphoid depletion."""
    rule = _rule("lymphoid_depletion")
    result = _evaluate_histopath_syndrome(
        "S1", "M", False, rule,
        subject_mi={},
        subject_ma={"S1": [_ma("SPLEEN", "Small")]},
        om_fold_changes={},
    )
    assert result is not None
    assert result["match_type"] == "full"


def test_hepatocellular_adaptation_fires_on_gross_liver_enlarged():
    """PointCross pattern: MA LIVER ENLARGED is the gross macroscopic
    correlate of adaptive hepatocellular hypertrophy.
    Citation: Hall et al. 2012 ESTP Liver Hypertrophy workshop."""
    rule = _rule("hepatocellular_adaptation")
    result = _evaluate_histopath_syndrome(
        "S1", "M", False, rule,
        subject_mi={},
        subject_ma={"S1": [_ma("LIVER", "ENLARGED")]},
        om_fold_changes={},
    )
    assert result is not None
    assert result["match_type"] == "full"


def test_adrenal_hypertrophy_fires_on_gross_adrenal_enlargement():
    """TOXSCI 35449 dog pattern: MA GLAND, ADRENAL Enlargement is the
    gross macroscopic correlate of cortical hypertrophy.
    Citation: Yoshitomi et al. 2018 INHAND endocrine."""
    rule = _rule("adrenal_hypertrophy")
    result = _evaluate_histopath_syndrome(
        "S1", "M", False, rule,
        subject_mi={},
        subject_ma={"S1": [_ma("ADRENAL GLAND", "Enlargement")]},
        om_fold_changes={},
    )
    assert result is not None
    assert result["match_type"] == "full"


def test_adrenal_hypertrophy_fires_on_gross_adrenal_swollen():
    """PDS pattern: MA GLAND, ADRENAL swollen (alias of enlargement).
    Citation: Yoshitomi et al. 2018 INHAND endocrine."""
    rule = _rule("adrenal_hypertrophy")
    result = _evaluate_histopath_syndrome(
        "S1", "M", False, rule,
        subject_mi={},
        subject_ma={"S1": [_ma("ADRENAL", "swollen")]},
        om_fold_changes={},
    )
    assert result is not None
    assert result["match_type"] == "full"


def test_injection_site_reaction_fires_on_send_specimen_token():
    """CBER vaccine + gene-therapy studies use SEND-CDISC specimen token
    'SITE, INJECTION' / 'SITE, APPLICATION' (CDISC SEND IG v3.1 §6).
    Without the alias the rule was unreachable on those studies."""
    rule = _rule("injection_site_reaction")
    result = _evaluate_histopath_syndrome(
        "S1", "M", False, rule,
        subject_mi={"S1": [_ma("SITE, INJECTION", "necrosis")]},
        subject_ma={},
        om_fold_changes={},
    )
    assert result is not None
    assert result["match_type"] == "full"


def test_injection_site_reaction_fires_on_ulceration():
    """van Meer et al. 2016 documents ulceration as an injection-site
    reaction term for subcutaneous oligonucleotide therapy."""
    rule = _rule("injection_site_reaction")
    result = _evaluate_histopath_syndrome(
        "S1", "M", False, rule,
        subject_mi={"S1": [_ma("SITE, APPLICATION", "ulceration")]},
        subject_ma={},
        om_fold_changes={},
    )
    assert result is not None
    assert result["match_type"] == "full"
