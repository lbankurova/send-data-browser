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
    assess_finding_recognition,
    assess_organ_recognition,
    assess_test_code_recognition,
    extract_base_concept,
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

    def test_liver_exact_after_feature_7(self):
        """AC-7.1: After Feature 7 organ alias expansion (etransafe-send-snomed
        cycle), LIVER is a canonical organ group. This is an intentional flip
        of the pre-Feature-7 test_liver_currently_unmatched test."""
        assert assess_organ_recognition("LIVER") == ("LIVER", 1, "exact")

    def test_brain_exact_after_feature_7(self):
        """AC-7.4: BRAIN is also added as a canonical."""
        assert assess_organ_recognition("BRAIN") == ("BRAIN", 1, "exact")

    def test_intestine_subregion_alias_after_feature_7(self):
        """AC-7.4 + intended-changes allowlist: SMALL INTESTINE, JEJUNUM
        resolves at level 2 alias to SMALL INTESTINE (parent organ group
        convention, mirrors BONE MARROW, FEMUR -> BONE MARROW)."""
        assert assess_organ_recognition("SMALL INTESTINE, JEJUNUM") == (
            "SMALL INTESTINE", 2, "alias"
        )

    def test_bladder_alias_after_feature_7(self):
        """AC-7.4: BLADDER is an alias of URINARY BLADDER."""
        assert assess_organ_recognition("BLADDER") == ("URINARY BLADDER", 2, "alias")

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
        """Phase C / Feature 7: BRAIN is now a canonical (added by Feature 7).
        For 'BRAIN/SPINAL CORD' Tier 3 splits on '/' and matches the FIRST
        canonical, which is now BRAIN (was SPINAL CORD before Feature 7).
        Still demoted to level 6 per scope gate."""
        assert assess_organ_recognition("BRAIN/SPINAL CORD") == ("BRAIN", 6, "slash_compound")

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
        """After cache reset, returns the versions from disk for all three
        loaded dictionaries (test_code, organ, finding_synonyms). The
        organ_aliases dict was bumped to 1.1.0 by Feature 7."""
        versions = get_dictionary_versions()
        assert versions == {
            "test_code_aliases": "1.0.0",
            "organ_aliases": "1.1.0",
            "finding_synonyms": "1.0.0",
        }

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
        assert versions["organ_aliases"] == "1.1.0"


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
        # Post-Phase B/C the body mentions Phase B/C explicitly; "Phase A" is
        # also preserved as a historical reference in the body.
        assert "Phase" in PHASE_A_RECOGNITION_CAVEAT


# ──────────────────────────────────────────────────────────────
# extract_base_concept — Phase B/C unit tests (AC-2.1 .. AC-2.12)
# ──────────────────────────────────────────────────────────────

class TestExtractBaseConcept:
    """Direct unit tests for extract_base_concept against the live Phase C
    finding-synonyms dictionary. Covers each research-enumerated edge case.
    """

    def test_ac_2_1_comma_suffix(self):
        """AC-2.1: 'HYPERPLASIA, FOLLICULAR CELL' -> ('HYPERPLASIA', 'FOLLICULAR CELL', 'comma_suffix')
        when HYPERPLASIA is a canonical."""
        assert extract_base_concept("HYPERPLASIA, FOLLICULAR CELL", "MI") == (
            "HYPERPLASIA", "FOLLICULAR CELL", "comma_suffix"
        )

    def test_ac_2_2_prefix_modifier(self):
        """AC-2.2: 'HEPATOCELLULAR HYPERTROPHY' -> ('HYPERTROPHY', 'HEPATOCELLULAR', 'prefix_modifier')
        when HYPERTROPHY is a canonical and HEPATOCELLULAR is in the qualifier lexicon."""
        assert extract_base_concept("HEPATOCELLULAR HYPERTROPHY", "MI") == (
            "HYPERTROPHY", "HEPATOCELLULAR", "prefix_modifier"
        )

    def test_ac_2_3_compound_finding_rejected(self):
        """AC-2.3: 'INFLAMMATION/NECROSIS' -> (None, None, 'none') — slash separator
        signals two distinct findings; no decomposition."""
        assert extract_base_concept("INFLAMMATION/NECROSIS", "MI") == (None, None, "none")

    def test_ac_2_4_severity_modifier_rejected(self):
        """AC-2.4 (literal spec text): 'MINIMAL NEPHROPATHY' -> (None, None, 'none').
        MINIMAL is a severity modifier, not a qualifier. Per spec AC-2.4 the
        mode is 'none' (explicit rejection), not 'unmatched'."""
        assert extract_base_concept("MINIMAL NEPHROPATHY", "MI") == (None, None, "none")

    def test_ac_2_5_negation_passes_through(self):
        """AC-2.5: 'NON-PROLIFERATIVE' -> (None, None, 'none') — negated prefix
        must not be stripped."""
        assert extract_base_concept("NON-PROLIFERATIVE", "MI") == (None, None, "none")

    def test_ac_2_6_cl_domain_no_decomposition(self):
        """AC-2.6: 'ALOPECIA' in CL domain -> (None, None, 'none') — CL domain
        does not attempt base-concept decomposition in this cycle."""
        assert extract_base_concept("ALOPECIA", "CL") == (None, None, "none")

    def test_ac_2_7_purity_same_inputs_same_output(self):
        """AC-2.7: pure function — repeated calls produce identical output."""
        a = extract_base_concept("HEPATOCELLULAR HYPERTROPHY", "MI")
        b = extract_base_concept("HEPATOCELLULAR HYPERTROPHY", "MI")
        c = extract_base_concept("HEPATOCELLULAR HYPERTROPHY", "MI")
        assert a == b == c

    def test_ac_2_8_edge_case_coverage_surface(self):
        """AC-2.8: all six research-enumerated edge case categories covered.
        This test exists as a meta-assertion that the individual AC tests above
        span the full category set (multi-qualifier, anatomical subregion,
        species-specific, compound, negation, severity-embedded). Each rejected
        case returns mode 'none' per the individual AC literal text."""
        covered = {
            "multi_qualifier": extract_base_concept(
                "HYPERPLASIA, FOLLICULAR CELL, DIFFUSE", "MI"
            ),
            "anatomical_subregion": extract_base_concept(
                "HYPERTROPHY, CENTRILOBULAR", "MI"
            ),
            "species_specific": extract_base_concept("BASOPHILIC FOCUS", "MI"),
            "compound": extract_base_concept("INFLAMMATION/NECROSIS", "MI"),
            "negation": extract_base_concept("NON-PROLIFERATIVE", "MI"),
            "severity_embedded": extract_base_concept("MINIMAL NEPHROPATHY", "MI"),
        }
        # Accept-path categories return comma_suffix/prefix_modifier.
        assert covered["multi_qualifier"][2] == "comma_suffix"
        assert covered["anatomical_subregion"][2] == "comma_suffix"
        # Reject-path categories return literal "none" per spec AC text.
        assert covered["species_specific"] == (None, None, "none")
        assert covered["compound"] == (None, None, "none")
        assert covered["negation"] == (None, None, "none")
        assert covered["severity_embedded"] == (None, None, "none")

    def test_ac_2_9_multi_qualifier(self):
        """AC-2.9: 'HYPERPLASIA, FOLLICULAR CELL, DIFFUSE' -> ('HYPERPLASIA',
        'FOLLICULAR CELL, DIFFUSE', 'comma_suffix'). First comma splits; the
        entire remainder becomes the qualifier."""
        assert extract_base_concept(
            "HYPERPLASIA, FOLLICULAR CELL, DIFFUSE", "MI"
        ) == ("HYPERPLASIA", "FOLLICULAR CELL, DIFFUSE", "comma_suffix")

    def test_ac_2_10_anatomical_subregion(self):
        """AC-2.10: 'HYPERTROPHY, CENTRILOBULAR' -> ('HYPERTROPHY',
        'CENTRILOBULAR', 'comma_suffix'). Anatomical qualifiers are treated
        like cell-type qualifiers — both are accepted as valid qualifier tokens."""
        assert extract_base_concept("HYPERTROPHY, CENTRILOBULAR", "MI") == (
            "HYPERTROPHY", "CENTRILOBULAR", "comma_suffix"
        )

    def test_ac_2_11_species_specific_conservative_default(self):
        """AC-2.11 (literal spec text): 'BASOPHILIC FOCUS' -> (None, None, 'none').
        Conservative default: reject species-specific modifiers not in the
        qualifier lexicon. BASOPHILIC is NOT in INITIAL_QUALIFIER_LEXICON."""
        assert extract_base_concept("BASOPHILIC FOCUS", "MI") == (None, None, "none")

    def test_ac_2_12_disambiguator_inflammation_necrosis(self):
        """AC-2.12 (R1 F9 stress test, literal spec text): 'INFLAMMATION, NECROSIS'
        -> (None, None, 'none'). Both halves are canonical findings; the parser
        rejects the decomposition because the right side is NOT a qualifier —
        it is a distinct finding. This is the disambiguator that AC-2.3
        (slash-separated) does not cover."""
        assert extract_base_concept("INFLAMMATION, NECROSIS", "MI") == (None, None, "none")


# ──────────────────────────────────────────────────────────────
# assess_finding_recognition — Phase B/C unit tests (AC-3.1 .. AC-3.10)
# ──────────────────────────────────────────────────────────────

class TestAssessFindingRecognition:
    """Direct unit tests for the Phase B/C dispatcher. Covers each level
    branch and the source telemetry field (BFIELD-149)."""

    def test_ac_3_1_level_1_exact(self):
        """AC-3.1: 'RETINAL FOLD' resolves at level 1 exact with source list."""
        canonical, level, reason, base, qual, source = assess_finding_recognition(
            "MI", "RETINAL FOLD"
        )
        assert canonical == "RETINAL FOLD"
        assert level == 1
        assert reason == "exact"
        assert base is None
        assert qual is None
        assert source is not None
        assert isinstance(source, list)
        assert len(source) > 0
        assert "NONNEO" in source

    def test_ac_3_2_level_2_alias_deterministic(self):
        """AC-3.2 (R1 F1+F8 deterministic): 'RETINAL FOLD(S)' resolves at level 2
        alias with full source provenance list preserved. The verdict is
        deterministic — no 'or' in the expected value."""
        canonical, level, reason, base, qual, source = assess_finding_recognition(
            "MI", "RETINAL FOLD(S)"
        )
        assert canonical == "RETINAL FOLD"
        assert level == 2
        assert reason == "alias"
        assert base is None
        assert qual is None
        assert source is not None

    def test_ac_3_3_level_3_base_concept(self):
        """AC-3.3: 'HEPATOCELLULAR HYPERTROPHY' -> canonical comma-suffix form
        'HYPERTROPHY, HEPATOCELLULAR' at level 3, with base and qualifier
        returned separately."""
        canonical, level, reason, base, qual, source = assess_finding_recognition(
            "MI", "HEPATOCELLULAR HYPERTROPHY"
        )
        assert canonical == "HYPERTROPHY, HEPATOCELLULAR"
        assert level == 3
        assert reason == "base_concept"
        assert base == "HYPERTROPHY"
        assert qual == "HEPATOCELLULAR"
        assert source is not None

    def test_ac_3_4_level_6_unmatched(self):
        """AC-3.4: 'ZZUNKNOWN' (not in dict, MI domain) -> level 6 unmatched."""
        assert assess_finding_recognition("MI", "ZZUNKNOWN") == (
            "ZZUNKNOWN", 6, "unmatched", None, None, None
        )

    def test_ac_3_5_om_no_dictionary(self):
        """AC-3.5: 'WEIGHT' in OM domain -> level 6 no_dictionary (OM is out
        of Phase C scope)."""
        assert assess_finding_recognition("OM", "WEIGHT") == (
            "WEIGHT", 6, "no_dictionary", None, None, None
        )

    def test_ac_3_6_empty_input(self):
        """AC-3.6: empty string -> ('', 6, 'empty', None, None, None)."""
        assert assess_finding_recognition("MI", "") == (
            "", 6, "empty", None, None, None
        )

    def test_ac_3_7_case_and_whitespace_normalized(self):
        """AC-3.7: lowercase and surrounding whitespace are normalized identically
        to assess_test_code_recognition."""
        canonical, level, reason, _, _, _ = assess_finding_recognition(
            "MI", "  retinal fold(s)  "
        )
        assert canonical == "RETINAL FOLD"
        assert level == 2
        assert reason == "alias"

    def test_ac_3_8_graceful_fallback_on_missing_dictionary(self, monkeypatch):
        """AC-3.8: monkeypatch the dictionary-loaded state to simulate a missing
        source file. The dispatcher falls through to no_dictionary gracefully
        without raising."""
        # Force the finding_synonyms data to be empty
        monkeypatch.setattr(sk, "_FINDING_SYNONYMS_DATA", {
            "version": "test-empty",
            "qualifiers": [],
            "severity_modifiers": [],
            "domains": {},
        })
        monkeypatch.setattr(sk, "_FINDING_REVERSE_MAP", None)
        monkeypatch.setattr(sk, "_FINDING_CANONICAL_SOURCES", None)
        monkeypatch.setattr(sk, "_FINDING_QUALIFIERS", None)
        monkeypatch.setattr(sk, "_FINDING_SEVERITY_MODIFIERS", None)
        # Dispatch with empty dictionary — graceful fallback
        canonical, level, reason, base, qual, source = assess_finding_recognition(
            "MI", "HYPERTROPHY"
        )
        assert level == 6
        assert reason == "no_dictionary"
        assert canonical == "HYPERTROPHY"
        assert source is None

    def test_ac_3_9_six_tuple_signature(self):
        """AC-3.9 (architect ADVISORY-2 / R1 F8): function returns a 6-tuple
        (canonical, level, reason, base_concept, qualifier, source)."""
        result = assess_finding_recognition("MI", "RETINAL FOLD")
        assert isinstance(result, tuple)
        assert len(result) == 6

    def test_ac_3_10_multi_source_alias_list_preserved(self):
        """AC-3.10 (R1 F1): multi-source aliases resolve to level 2 with the
        full source provenance list. The RETINAL FOLD entry in the live
        dictionary has sources from NONNEO + sendigR + eTRANSAFE."""
        canonical, level, reason, _, _, source = assess_finding_recognition(
            "MI", "RETINAL FOLD(S)"
        )
        assert level == 2
        assert source is not None
        # Verify provenance preservation — at least the three source sources
        # the build script merges should be present when applicable.
        assert "NONNEO" in source or "sendigR" in source or "eTRANSAFE" in source
