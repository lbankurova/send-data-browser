"""Tests for Phase A term recognition helpers in send_knowledge.py.

Covers:
- assess_test_code_recognition() — LB alias resolution, self_canonical, BUN-style
  canonical-of-group, empty/whitespace/lowercase, no-dictionary domains.
- assess_organ_recognition() — canonical/alias/prefix/slash_compound/unmatched/empty.
- get_dictionary_versions() — live version strings, robust to reverse-map monkeypatch.

Acceptance criteria: Feature 1 in unrecognized-term-flagging-synthesis.md
(AC-1..AC-11). See also R1 F1, F3, F4, F5, F7 rationale in the synthesis.
"""

import pytest

from services.analysis import send_knowledge as sk
from services.analysis.send_knowledge import (
    PHASE_A_RECOGNITION_CAVEAT,
    _reset_dictionary_caches_for_tests,
    assess_organ_recognition,
    assess_test_code_recognition,
    get_dictionary_versions,
    normalize_organ,
    normalize_test_code,
)


@pytest.fixture(autouse=True)
def _reset_dictionary_caches():
    """Ensure every test starts with a clean dictionary cache."""
    _reset_dictionary_caches_for_tests()
    yield
    _reset_dictionary_caches_for_tests()


# ──────────────────────────────────────────────────────────────
# assess_test_code_recognition — LB family
# ──────────────────────────────────────────────────────────────

class TestAssessTestCodeLB:
    def test_level_1_in_self_canonical(self):
        """ALT is in self_canonical -- level 1 exact."""
        assert assess_test_code_recognition("LB", "ALT") == ("ALT", 1, "exact")

    def test_level_1_canonical_of_alias_group_bun(self):
        """R1 F4: BUN is the canonical of BUN_GROUP and NOT in self_canonical,
        but still qualifies as level 1."""
        assert assess_test_code_recognition("LB", "BUN") == ("BUN", 1, "exact")

    def test_level_1_both_self_canonical_and_alias_canonical(self):
        """R1 F4: RETIRBC is both in self_canonical AND canonical of RETIRBC_GROUP."""
        assert assess_test_code_recognition("LB", "RETIRBC") == ("RETIRBC", 1, "exact")

    def test_level_2_alias_alat(self):
        """ALAT -> ALT via alias_groups."""
        assert assess_test_code_recognition("LB", "ALAT") == ("ALT", 2, "alias")

    def test_level_2_alias_urean(self):
        """UREAN -> BUN via alias_groups."""
        assert assess_test_code_recognition("LB", "UREAN") == ("BUN", 2, "alias")

    def test_level_6_unmatched_in_lb_with_dictionary(self):
        """LB HAS a dictionary, term is not in it -> level 6 unmatched."""
        assert assess_test_code_recognition("LB", "ESTROGEN") == ("ESTROGEN", 6, "unmatched")


# ──────────────────────────────────────────────────────────────
# assess_test_code_recognition — MI/MA/CL/OM/TF/DS (no dictionary)
# ──────────────────────────────────────────────────────────────

class TestAssessTestCodeNoDictionary:
    def test_mi_always_no_dictionary(self):
        """Phase A has no MI synonym dictionary -- every term is level 6 no_dictionary."""
        assert assess_test_code_recognition(
            "MI", "HEPATOCELLULAR HYPERTROPHY"
        ) == ("HEPATOCELLULAR HYPERTROPHY", 6, "no_dictionary")

    def test_ma_always_no_dictionary(self):
        assert assess_test_code_recognition(
            "MA", "DISCOLORATION"
        ) == ("DISCOLORATION", 6, "no_dictionary")

    def test_cl_no_dictionary(self):
        assert assess_test_code_recognition("CL", "ALOPECIA") == ("ALOPECIA", 6, "no_dictionary")

    def test_om_no_dictionary(self):
        assert assess_test_code_recognition("OM", "WEIGHT") == ("WEIGHT", 6, "no_dictionary")


# ──────────────────────────────────────────────────────────────
# assess_test_code_recognition — edge cases (R1 F5)
# ──────────────────────────────────────────────────────────────

class TestAssessTestCodeEdgeCases:
    def test_case_insensitive_lowercase(self):
        """Lowercase input is upcased before classification."""
        assert assess_test_code_recognition("LB", "alat") == ("ALT", 2, "alias")

    def test_strips_whitespace(self):
        assert assess_test_code_recognition("LB", "  alat  ") == ("ALT", 2, "alias")

    def test_strips_whitespace_and_upcase(self):
        assert assess_test_code_recognition("LB", "  ALAT  ") == ("ALT", 2, "alias")

    def test_empty_input_reason_empty(self):
        """Empty raw -> ('', 6, 'empty')."""
        assert assess_test_code_recognition("LB", "") == ("", 6, "empty")

    def test_whitespace_only_input_reason_empty(self):
        """Whitespace-only raw -> ('', 6, 'empty')."""
        assert assess_test_code_recognition("LB", "   ") == ("", 6, "empty")

    def test_empty_domain_falls_to_no_dictionary(self):
        """R1 F5: empty domain string falls to the no-dictionary branch."""
        assert assess_test_code_recognition("", "ALT") == ("ALT", 6, "no_dictionary")

    def test_unknown_domain_falls_to_no_dictionary(self):
        assert assess_test_code_recognition("XX", "FOO") == ("FOO", 6, "no_dictionary")


# ──────────────────────────────────────────────────────────────
# assess_organ_recognition — canonicals and aliases
# ──────────────────────────────────────────────────────────────

class TestAssessOrganCanonicals:
    def test_bone_marrow_is_canonical(self):
        """BONE MARROW is the canonical group name -- level 1."""
        assert assess_organ_recognition("BONE MARROW") == ("BONE MARROW", 1, "exact")

    def test_kidney_is_canonical(self):
        assert assess_organ_recognition("KIDNEY") == ("KIDNEY", 1, "exact")

    def test_liver_currently_unmatched(self):
        """R1 F3 verification: LIVER is NOT in the organ registry yet.
        Adding obvious organs is the Phase A self-improvement loop (DG-2)."""
        assert assess_organ_recognition("LIVER") == ("LIVER", 6, "unmatched")

    def test_alias_bone_marrow_femur(self):
        assert assess_organ_recognition("BONE MARROW, FEMUR") == ("BONE MARROW", 2, "alias")

    def test_lung_bronchus_is_alias_not_slash_compound(self):
        """R1 F1 critical fix: LUNG/BRONCHUS is a REGISTERED alias of LUNG
        (organ-aliases.json line 14). Tier 1 catches it before Tier 3 runs,
        so it resolves at level 2 alias, NOT level 6 slash_compound."""
        assert assess_organ_recognition("LUNG/BRONCHUS") == ("LUNG", 2, "alias")


# ──────────────────────────────────────────────────────────────
# assess_organ_recognition — prefix and slash_compound demoted to level 6
# ──────────────────────────────────────────────────────────────

class TestAssessOrganLowConfidence:
    def test_prefix_tier_bone_marrow_extract(self):
        """R1 F3: 'BONE MARROW EXTRACT' not in registry but starts with
        'BONE MARROW ' -- Tier 2 fires. Demoted to level 6 per scope gate."""
        assert assess_organ_recognition("BONE MARROW EXTRACT") == ("BONE MARROW", 6, "prefix")

    def test_prefix_tier_lymph_node_novel(self):
        """R1 F3: hierarchical lymph-node subtype not in registry; Tier 2
        catches 'LYMPH NODE,' prefix. Demoted to level 6."""
        assert assess_organ_recognition("LYMPH NODE, NOVEL") == ("LYMPH NODE", 6, "prefix")

    def test_real_slash_compound_brain_spinal_cord(self):
        """R1 F1: BRAIN is not in registry, SPINAL CORD is. Tier 3 splits
        on '/' and returns SPINAL CORD. Demoted to level 6 per scope gate."""
        assert assess_organ_recognition("BRAIN/SPINAL CORD") == ("SPINAL CORD", 6, "slash_compound")

    def test_unmatched_passes_through(self):
        """No match at any tier -- raw passes through uppercased."""
        assert assess_organ_recognition("ZORG") == ("ZORG", 6, "unmatched")


# ──────────────────────────────────────────────────────────────
# assess_organ_recognition — edge cases (R1 F5)
# ──────────────────────────────────────────────────────────────

class TestAssessOrganEdgeCases:
    def test_strips_and_uppers(self):
        assert assess_organ_recognition("  bone marrow  ") == ("BONE MARROW", 1, "exact")

    def test_lowercase_alias(self):
        assert assess_organ_recognition("bone marrow, femur") == ("BONE MARROW", 2, "alias")

    def test_empty_input_reason_empty(self):
        assert assess_organ_recognition("") == ("", 6, "empty")

    def test_whitespace_only_reason_empty(self):
        assert assess_organ_recognition("   ") == ("", 6, "empty")


# ──────────────────────────────────────────────────────────────
# Purity + parity with normalize_test_code / normalize_organ
# ──────────────────────────────────────────────────────────────

class TestHelperParity:
    def test_normalize_test_code_unchanged_urean(self):
        """AC-10: normalize_test_code signature+behavior unchanged."""
        assert normalize_test_code("UREAN") == "BUN"

    def test_normalize_test_code_unchanged_xyzzy(self):
        assert normalize_test_code("XYZZY") == "XYZZY"

    def test_normalize_organ_unchanged_lymph_node_iliac(self):
        """AC-10: normalize_organ signature+behavior unchanged."""
        # "LYMPH NODE, ILIAC" is a registered alias -> Tier 1 -> LYMPH NODE
        assert normalize_organ("LYMPH NODE, ILIAC") == "LYMPH NODE"

    def test_normalize_organ_lung_bronchus_unchanged(self):
        assert normalize_organ("LUNG/BRONCHUS") == "LUNG"


# ──────────────────────────────────────────────────────────────
# get_dictionary_versions — R1 F7 cache refactor
# ──────────────────────────────────────────────────────────────

class TestDictionaryVersions:
    def test_returns_live_version(self):
        """After cache reset, returns the versions from disk."""
        versions = get_dictionary_versions()
        assert versions == {"test_code_aliases": "1.0.0", "organ_aliases": "1.0.0"}

    def test_stable_to_reverse_map_monkeypatch(self, monkeypatch):
        """R1 F7: monkeypatching _TEST_CODE_REVERSE_MAP does NOT affect the
        version string, because get_dictionary_versions reads from the full
        data cache, not from a parallel version global."""
        # Prime the data cache and reverse map
        get_dictionary_versions()
        # Now corrupt the reverse map -- simulating a test fixture
        monkeypatch.setattr(sk, "_TEST_CODE_REVERSE_MAP", {"FAKE": "FAKE"})
        # Version must still be live
        versions = get_dictionary_versions()
        assert versions["test_code_aliases"] == "1.0.0"
        assert versions["organ_aliases"] == "1.0.0"


# ──────────────────────────────────────────────────────────────
# PHASE_A_RECOGNITION_CAVEAT — module constant (R1 F12)
# ──────────────────────────────────────────────────────────────

class TestPhaseACaveat:
    def test_caveat_is_non_empty_string(self):
        assert isinstance(PHASE_A_RECOGNITION_CAVEAT, str)
        assert len(PHASE_A_RECOGNITION_CAVEAT) > 50

    def test_caveat_mentions_dictionary_completeness(self):
        """Sanity: the caveat explains the right thing."""
        assert "dictionary completeness" in PHASE_A_RECOGNITION_CAVEAT
        assert "Phase A" in PHASE_A_RECOGNITION_CAVEAT
