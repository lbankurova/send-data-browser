"""Tests for build_unrecognized_terms_report() — the per-study recognition
report builder (Feature 3 of unrecognized-term-flagging-synthesis.md).

Covers schema shape, string-keyed levels, denominator handling, null-rate
semantics on empty denominators, truncation sentinel, dictionary_versions
snapshot pass-through, and phase_a_caveat identity.
"""

import pytest

from services.analysis import send_knowledge as sk
from services.analysis.send_knowledge import (
    PHASE_A_RECOGNITION_CAVEAT,
    _reset_dictionary_caches_for_tests,
    build_unrecognized_terms_report,
    get_dictionary_versions,
)


@pytest.fixture(autouse=True)
def _reset_dictionary_caches():
    _reset_dictionary_caches_for_tests()
    yield
    _reset_dictionary_caches_for_tests()


def _finding(
    domain: str,
    test_code: str,
    specimen: str,
    tc_level: int | None,
    tc_reason: str | None,
    org_level: int | None,
    org_tier: str | None,
) -> dict:
    """Build a minimal enriched-finding-shaped dict for the report builder."""
    return {
        "domain": domain,
        "test_code": test_code,
        "specimen": specimen,
        "test_code_recognition_level": tc_level,
        "test_code_recognition_reason": tc_reason,
        "organ_recognition_level": org_level,
        "organ_norm_tier": org_tier,
    }


def _versions() -> dict[str, str]:
    return {"test_code_aliases": "1.0.0", "organ_aliases": "1.0.0"}


# ──────────────────────────────────────────────────────────────
# Empty / minimal inputs
# ──────────────────────────────────────────────────────────────

class TestEmptyFindings:
    def test_empty_findings_list(self):
        """Zero findings -> structurally valid report, no errors."""
        r = build_unrecognized_terms_report([], "Empty", _versions())
        assert r["study_id"] == "Empty"
        assert r["summary"]["total_findings"] == 0
        assert r["summary"]["findings_with_test_code"] == 0
        assert r["summary"]["findings_with_specimen"] == 0
        assert r["summary"]["levels_present"] == []
        assert r["summary"]["recognition_rate_test_code"] is None
        assert r["summary"]["recognition_rate_organ"] is None
        assert r["unrecognized_test_codes"] == []
        assert r["unrecognized_organs"] == []
        assert r["unrecognized_test_codes_truncated"] is None
        assert r["unrecognized_organs_truncated"] is None

    def test_all_null_test_codes_rate_null_not_zero(self):
        """R1 F8: rate is None (not 0.0) when every test_code is null."""
        findings = [
            _finding("MI", "", "LIVER", None, None, None, None)
            for _ in range(5)
        ]
        r = build_unrecognized_terms_report(findings, "NullTC", _versions())
        assert r["summary"]["findings_with_test_code"] == 0
        assert r["summary"]["recognition_rate_test_code"] is None


# ──────────────────────────────────────────────────────────────
# Schema: string-keyed levels, levels_present (R1 F8)
# ──────────────────────────────────────────────────────────────

class TestSchemaStringKeys:
    def test_level_keys_are_strings(self):
        findings = [
            _finding("LB", "ALT", "", 1, "exact", None, None),
            _finding("LB", "ALAT", "", 2, "alias", None, None),
            _finding("LB", "XYZZY", "", 6, "unmatched", None, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        keys = list(r["summary"]["by_test_code_level"].keys())
        assert all(isinstance(k, str) for k in keys), keys
        assert set(keys) == {"1", "2", "6"}

    def test_levels_present_sorted_and_sparse(self):
        """Only the present keys appear, in sorted order."""
        findings = [
            _finding("LB", "ALT", "", 1, "exact", None, None),
            _finding("LB", "XYZZY", "", 6, "unmatched", None, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert r["summary"]["levels_present"] == ["1", "6"]

    def test_no_level_n_property_name_leakage(self):
        """Schema must not emit level_1/level_2/level_6 keys."""
        findings = [_finding("LB", "ALT", "", 1, "exact", None, None)]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        summary = r["summary"]
        for bad in ("level_1", "level_2", "level_6"):
            assert bad not in summary
            assert bad not in summary["by_test_code_level"]


# ──────────────────────────────────────────────────────────────
# Counts and denominators
# ──────────────────────────────────────────────────────────────

class TestCountsAndRates:
    def test_lb_only_rate(self):
        """5 L1 + 3 L2 + 2 L6 -> rate = 8/10 = 0.8."""
        findings = (
            [_finding("LB", "ALT", "", 1, "exact", None, None)] * 5
            + [_finding("LB", "ALAT", "", 2, "alias", None, None)] * 3
            + [_finding("LB", "XYZZY", "", 6, "unmatched", None, None)] * 2
        )
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert r["summary"]["by_test_code_level"] == {"1": 5, "2": 3, "6": 2}
        assert r["summary"]["findings_with_test_code"] == 10
        assert r["summary"]["recognition_rate_test_code"] == 0.8

    def test_null_test_codes_excluded_from_denominator(self):
        """R1 F8: findings with null test_code_recognition_level do not
        contribute to findings_with_test_code."""
        findings = (
            [_finding("LB", "ALT", "", 1, "exact", None, None)] * 7
            + [_finding("LB", "", "", None, None, None, None)] * 3
        )
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert r["summary"]["findings_with_test_code"] == 7
        assert r["summary"]["recognition_rate_test_code"] == 1.0

    def test_organ_rate_denominator(self):
        findings = [
            _finding("LB", "ALT", "SERUM", 1, "exact", 6, "unmatched"),
            _finding("LB", "ALT", "BONE MARROW", 1, "exact", 1, None),
            _finding("LB", "ALT", "", 1, "exact", None, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert r["summary"]["findings_with_specimen"] == 2
        assert r["summary"]["recognition_rate_organ"] == 0.5

    def test_rate_denominator_strings_documented(self):
        r = build_unrecognized_terms_report([], "S", _versions())
        assert "findings_with_test_code" in r["summary"]["recognition_rate_test_code_denominator"]
        assert "findings_with_specimen" in r["summary"]["recognition_rate_organ_denominator"]


# ──────────────────────────────────────────────────────────────
# phase_a_caveat identity (R1 F12)
# ──────────────────────────────────────────────────────────────

class TestPhaseACaveatIdentity:
    def test_caveat_identity(self):
        """R1 F12: caveat is the module constant (identity, not substring)."""
        r = build_unrecognized_terms_report([], "S", _versions())
        assert r["phase_a_caveat"] is PHASE_A_RECOGNITION_CAVEAT


# ──────────────────────────────────────────────────────────────
# dictionary_versions_snapshot (R1 F14)
# ──────────────────────────────────────────────────────────────

class TestDictionaryVersionsSnapshot:
    def test_snapshot_is_pass_through(self):
        """The snapshot equals the versions dict the caller passed in."""
        versions = {"test_code_aliases": "1.0.0", "organ_aliases": "1.0.0"}
        r = build_unrecognized_terms_report([], "S", versions)
        assert r["dictionary_versions_snapshot"] == versions

    def test_snapshot_matches_get_dictionary_versions(self):
        """The common case: pass through get_dictionary_versions()."""
        versions = get_dictionary_versions()
        r = build_unrecognized_terms_report([], "S", versions)
        assert r["dictionary_versions_snapshot"] == versions

    def test_source_field_names_canonical_location(self):
        r = build_unrecognized_terms_report([], "S", _versions())
        assert r["dictionary_versions_source"] == "study_metadata_enriched.json"


# ──────────────────────────────────────────────────────────────
# unrecognized_test_codes sorting, reason, and truncation (R1 F13)
# ──────────────────────────────────────────────────────────────

class TestUnrecognizedTestCodes:
    def test_sorted_by_count_descending(self):
        findings = (
            [_finding("LB", "RARE", "", 6, "unmatched", None, None)] * 1
            + [_finding("LB", "COMMON", "", 6, "unmatched", None, None)] * 5
            + [_finding("LB", "MEDIUM", "", 6, "unmatched", None, None)] * 3
        )
        r = build_unrecognized_terms_report(findings, "S", _versions())
        codes = [e["raw_code"] for e in r["unrecognized_test_codes"]]
        assert codes == ["COMMON", "MEDIUM", "RARE"]

    def test_carries_reason_field(self):
        findings = [
            _finding("MI", "HYPERTROPHY", "LIVER", 6, "no_dictionary", 6, "unmatched"),
            _finding("LB", "XYZZY", "SERUM", 6, "unmatched", 6, "unmatched"),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        reasons = {e["reason"] for e in r["unrecognized_test_codes"]}
        assert reasons == {"no_dictionary", "unmatched"}

    def test_truncation_sentinel_null_when_below_cap(self):
        findings = [
            _finding("LB", f"CODE{i}", "", 6, "unmatched", None, None)
            for i in range(10)
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert r["unrecognized_test_codes_truncated"] is None
        assert len(r["unrecognized_test_codes"]) == 10

    def test_truncation_sentinel_set_when_capped(self):
        """R1 F13: 1500 distinct codes -> shown 1000, total 1500."""
        findings = [
            _finding("LB", f"CODE{i}", "", 6, "unmatched", None, None)
            for i in range(1500)
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert r["unrecognized_test_codes_truncated"] == {"shown": 1000, "total": 1500}
        assert len(r["unrecognized_test_codes"]) == 1000

    def test_cap_is_1000_not_200(self):
        """R1 F13: cap was raised from 200 to 1000."""
        findings = [
            _finding("LB", f"CODE{i}", "", 6, "unmatched", None, None)
            for i in range(500)
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert len(r["unrecognized_test_codes"]) == 500

    def test_specimens_collected(self):
        """A single unrecognized code seen on multiple specimens collects them."""
        findings = [
            _finding("LB", "ESTROGEN", "SERUM", 6, "unmatched", None, None),
            _finding("LB", "ESTROGEN", "PLASMA", 6, "unmatched", None, None),
            _finding("LB", "ESTROGEN", "SERUM", 6, "unmatched", None, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert len(r["unrecognized_test_codes"]) == 1
        entry = r["unrecognized_test_codes"][0]
        assert entry["raw_code"] == "ESTROGEN"
        assert entry["count"] == 3
        assert entry["specimens"] == ["PLASMA", "SERUM"]


# ──────────────────────────────────────────────────────────────
# unrecognized_organs carries norm_tier
# ──────────────────────────────────────────────────────────────

class TestUnrecognizedOrgans:
    def test_carries_norm_tier(self):
        findings = [
            _finding("MI", "NECROSIS", "BRAIN/SPINAL CORD", 6, "no_dictionary", 6, "slash_compound"),
            _finding("MI", "NECROSIS", "FOOPAD", 6, "no_dictionary", 6, "unmatched"),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        tiers = {e["norm_tier"] for e in r["unrecognized_organs"]}
        assert tiers == {"slash_compound", "unmatched"}

    def test_truncation_sentinel_set_when_capped(self):
        findings = [
            _finding("MI", "HYPERTROPHY", f"ORGAN_{i}", 6, "no_dictionary", 6, "unmatched")
            for i in range(1500)
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        assert r["unrecognized_organs_truncated"] == {"shown": 1000, "total": 1500}
        assert len(r["unrecognized_organs"]) == 1000


# ──────────────────────────────────────────────────────────────
# Per-domain aggregation
# ──────────────────────────────────────────────────────────────

class TestPerDomain:
    def test_mi_zero_resolved_carries_phase_c_caveat(self):
        """Phase C: when a domain has a loaded dictionary but zero findings
        resolved at level 1/2/3, the per-domain note explains the coverage gap.
        Pre-Phase-C this case showed the Phase A 'no synonym dictionary' note."""
        findings = [
            _finding("MI", "ZZUNKNOWNFINDING1", "LIVER", 6, "unmatched", 6, "unmatched"),
            _finding("MI", "ZZUNKNOWNFINDING2", "KIDNEY", 6, "unmatched", 1, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        mi = r["by_domain"]["MI"]
        assert mi["total"] == 2
        assert mi["by_test_code_level"] == {"6": 2}
        assert mi["rate"] == 0.0
        assert mi["note"] is not None
        # Note says either "loaded but no findings resolved" OR
        # "no dictionary loaded yet" depending on whether the runtime dict
        # has MI entries. With the corpus dictionary built, the former applies.
        assert ("loaded but no findings resolved" in mi["note"]
                or "no MI synonym dictionary loaded" in mi["note"])

    def test_lb_high_rate_no_note(self):
        findings = [
            _finding("LB", "ALT", "SERUM", 1, "exact", 6, "unmatched")
        ] * 10
        r = build_unrecognized_terms_report(findings, "S", _versions())
        lb = r["by_domain"]["LB"]
        assert lb["rate"] == 1.0
        assert lb["note"] is None

    def test_domain_with_all_null_test_codes_handled(self):
        """Domain where every finding has null test_code -> rate None, count 0."""
        findings = [
            _finding("FOO", "", "", None, None, None, None)
            for _ in range(3)
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        foo = r["by_domain"]["FOO"]
        assert foo["total"] == 3
        assert foo["rate"] is None


# ──────────────────────────────────────────────────────────────
# Top-level schema shape
# ──────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────
# Phase B/C membership-check fix (AC-5.7 / AC-5.8 / AC-5.9)
# ──────────────────────────────────────────────────────────────


class TestPhaseCMembershipFix:
    """AC-5.7: tc_level membership predicate is (1, 2, 3) -- a level 3
    base-concept finding counts toward tc_recognized.
    AC-5.9: org_level membership predicate is deliberately (1, 2) -- a
    synthetic level 3 organ finding does NOT count toward org_recognized.
    """

    def test_level_3_counts_toward_tc_recognized(self):
        """AC-5.7: without the (1,2,3) fix, this test would assert
        recognition_rate_test_code == 0.0. The (1,2,3) fix makes the level 3
        finding count, so the rate is > 0."""
        findings = [
            _finding("MI", "RAW1", "LIVER", 3, "base_concept", 1, None),
            _finding("MI", "RAW2", "KIDNEY", 6, "unmatched", 1, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        # 1 of 2 resolved at level 3 -> rate 0.5
        assert r["summary"]["recognition_rate_test_code"] == 0.5
        assert r["by_domain"]["MI"]["rate"] == 0.5

    def test_level_3_excluded_from_unrecognized_array(self):
        """AC-5.6: unrecognized_test_codes[] only contains level 6 entries.
        Level 3 base-concept findings are recognized; do not appear in the
        unrecognized array."""
        findings = [
            _finding("MI", "FOO", "LIVER", 3, "base_concept", 1, None),
            _finding("MI", "BAR", "LIVER", 6, "unmatched", 1, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        raws = {e["raw_code"] for e in r["unrecognized_test_codes"]}
        assert "FOO" not in raws
        assert "BAR" in raws

    def test_org_level_3_does_NOT_count_toward_org_recognized(self):
        """AC-5.9: regression guardrail for the deliberate asymmetry between
        tc_level (now (1,2,3)) and org_level (still (1,2) -- no organ-side
        Phase C dictionary in this cycle, R1 F12).

        This test FORCES org_level=3 in the input (production code never
        emits this) and asserts the report does not count it. If a future
        implementer 'tidies' the asymmetry to (1,2,3) without realizing the
        intent, this test fires."""
        findings = [
            # Forced synthetic org_level=3 — production code never emits this
            # in this cycle. The test pins the asymmetry.
            _finding("MI", "RAW", "ORG_X", 1, "exact", 3, "alias"),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        # tc resolved -> rate 1.0
        assert r["summary"]["recognition_rate_test_code"] == 1.0
        # org rate: 0 of 1 resolved (level 3 ignored) -> rate 0.0
        assert r["summary"]["recognition_rate_organ"] == 0.0


# ──────────────────────────────────────────────────────────────
# Phase C per-domain caveat reflects new dictionary state
# ──────────────────────────────────────────────────────────────


class TestPhaseCPerDomainCaveat:
    def test_om_still_no_dictionary_caveat(self):
        """OM stays at the no-dictionary note (out of Phase C scope)."""
        findings = [
            _finding("OM", "WEIGHT", "LIVER", 6, "no_dictionary", 1, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        om = r["by_domain"]["OM"]
        assert om["note"] is not None
        assert "no OM synonym dictionary" in om["note"]

    def test_mi_resolved_findings_drop_caveat(self):
        """When at least one MI finding resolves at level 1/2/3, the per-domain
        caveat is suppressed (Phase C behavior)."""
        findings = [
            _finding("MI", "HYPERTROPHY", "LIVER", 1, "exact", 1, None),
            _finding("MI", "ZZ", "KIDNEY", 6, "unmatched", 1, None),
        ]
        r = build_unrecognized_terms_report(findings, "S", _versions())
        mi = r["by_domain"]["MI"]
        assert mi["note"] is None  # caveat suppressed



class TestSchemaShape:
    def test_all_top_level_keys_present(self):
        r = build_unrecognized_terms_report([], "S", _versions())
        required = {
            "study_id",
            "generated_at",
            "schema_version",
            "dictionary_versions_source",
            "dictionary_versions_snapshot",
            "phase_a_caveat",
            "summary",
            "by_domain",
            "unrecognized_test_codes",
            "unrecognized_test_codes_truncated",
            "unrecognized_organs",
            "unrecognized_organs_truncated",
        }
        assert required.issubset(r.keys())

    def test_generated_at_is_iso_z(self):
        r = build_unrecognized_terms_report([], "S", _versions())
        assert r["generated_at"].endswith("Z")

    def test_schema_version_is_semver(self):
        r = build_unrecognized_terms_report([], "S", _versions())
        assert r["schema_version"] == "1.0.0"
