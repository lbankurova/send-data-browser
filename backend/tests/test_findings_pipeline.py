"""Integration tests for Phase A term recognition in _enrich_finding().

Verifies Feature 2 acceptance criteria from the
unrecognized-term-flagging-synthesis.md build plan: every enriched finding
carries the four new recognition fields, canonical_testcd parity is preserved,
organ_norm_tier is null for level 1/2 (R1 F9), _with_defaults seeds all four
keys before enrichment (R1 F10), and partial enrichment failure still leaves
all four keys set to None.
"""

import pytest

from services.analysis import findings_pipeline as fp
from services.analysis.findings_pipeline import _enrich_finding, _with_defaults
from services.analysis.send_knowledge import _reset_dictionary_caches_for_tests


@pytest.fixture(autouse=True)
def _reset_dictionary_caches():
    _reset_dictionary_caches_for_tests()
    yield
    _reset_dictionary_caches_for_tests()


def _base(domain: str, test_code: str, specimen: str = "", data_type: str = "continuous") -> dict:
    return {
        "domain": domain,
        "test_code": test_code,
        "specimen": specimen,
        "sex": "M",
        "day": 28,
        "data_type": data_type,
        "direction": "up",
        "test_name": test_code,
        "pairwise": [],
        "group_stats": [],
    }


# ──────────────────────────────────────────────────────────────
# _with_defaults seeds the four recognition keys (R1 F10)
# ──────────────────────────────────────────────────────────────

class TestWithDefaultsSeedsRecognitionKeys:
    def test_all_four_keys_present_after_defaults(self):
        """R1 F10: _with_defaults must seed all four new keys so that if
        _enrich_finding raises mid-call, downstream consumers still see them."""
        f = _with_defaults({})
        for key in (
            "test_code_recognition_level",
            "test_code_recognition_reason",
            "organ_recognition_level",
            "organ_norm_tier",
        ):
            assert key in f
            assert f[key] is None


# ──────────────────────────────────────────────────────────────
# Full enrichment populates the four new keys
# ──────────────────────────────────────────────────────────────

class TestEnrichFindingPopulatesRecognition:
    def test_lb_alt_level_1_exact(self):
        f = _with_defaults(_base("LB", "ALT", specimen="SERUM"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "ALT"
        assert f["test_code_recognition_level"] == 1
        assert f["test_code_recognition_reason"] == "exact"

    def test_lb_alat_level_2_alias(self):
        f = _with_defaults(_base("LB", "ALAT"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "ALT"
        assert f["test_code_recognition_level"] == 2
        assert f["test_code_recognition_reason"] == "alias"

    def test_mi_hypertrophy_level_6_no_dictionary(self):
        f = _with_defaults(_base("MI", "HEPATOCELLULAR HYPERTROPHY",
                                  specimen="LIVER", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "HEPATOCELLULAR HYPERTROPHY"
        assert f["test_code_recognition_level"] == 6
        assert f["test_code_recognition_reason"] == "no_dictionary"

    def test_empty_test_code_nulls_paired(self):
        """When test_code is empty, canonical_testcd and BOTH recognition
        fields are None (AC-9: paired nullness invariant)."""
        f = _with_defaults(_base("LB", ""))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] is None
        assert f["test_code_recognition_level"] is None
        assert f["test_code_recognition_reason"] is None


# ──────────────────────────────────────────────────────────────
# canonical_testcd parity (regression — AC-2, AC-3)
# ──────────────────────────────────────────────────────────────

class TestCanonicalTestcdParity:
    def test_lb_alat_resolves_to_alt(self):
        """Regression: LB alias resolution is unchanged from pre-Phase-A."""
        f = _with_defaults(_base("LB", "ALAT"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "ALT"

    def test_lb_urean_resolves_to_bun(self):
        f = _with_defaults(_base("LB", "UREAN"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "BUN"

    def test_mi_hypertrophy_uppercase_passthrough(self):
        """Regression: MI findings keep uppercase-stripped raw as canonical."""
        f = _with_defaults(_base("MI", "hepatocellular hypertrophy",
                                  specimen="LIVER", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "HEPATOCELLULAR HYPERTROPHY"

    def test_bw_terminal_unchanged(self):
        f = _with_defaults(_base("BW", "TERMBW"))
        f = _enrich_finding(f)
        # TERMBW is not in the test-code registry -> level 6 unmatched, canonical = upper
        assert f["canonical_testcd"] == "TERMBW"
        assert f["test_code_recognition_level"] == 6
        assert f["test_code_recognition_reason"] == "unmatched"


# ──────────────────────────────────────────────────────────────
# organ_norm_tier is null for level 1/2 (R1 F9)
# ──────────────────────────────────────────────────────────────

class TestOrganNormTierNullability:
    def test_level_1_bone_marrow_tier_null(self):
        f = _with_defaults(_base("MI", "HYPERPLASIA",
                                  specimen="BONE MARROW", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["organ_recognition_level"] == 1
        assert f["organ_norm_tier"] is None

    def test_level_2_alias_tier_null(self):
        f = _with_defaults(_base("MI", "HYPERPLASIA",
                                  specimen="BONE MARROW, FEMUR", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["organ_recognition_level"] == 2
        assert f["organ_norm_tier"] is None

    def test_level_6_prefix_tier_set(self):
        f = _with_defaults(_base("MI", "HYPERPLASIA",
                                  specimen="BONE MARROW EXTRACT", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["organ_recognition_level"] == 6
        assert f["organ_norm_tier"] == "prefix"

    def test_level_6_slash_compound_tier_set(self):
        f = _with_defaults(_base("MI", "HYPERPLASIA",
                                  specimen="BRAIN/SPINAL CORD", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["organ_recognition_level"] == 6
        assert f["organ_norm_tier"] == "slash_compound"

    def test_level_6_unmatched_tier_set(self):
        f = _with_defaults(_base("MI", "HYPERPLASIA",
                                  specimen="FOOPAD", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["organ_recognition_level"] == 6
        assert f["organ_norm_tier"] == "unmatched"

    def test_empty_specimen_all_null(self):
        f = _with_defaults(_base("LB", "ALT"))
        f = _enrich_finding(f)
        assert f["organ_recognition_level"] is None
        assert f["organ_norm_tier"] is None


# ──────────────────────────────────────────────────────────────
# Partial enrichment failure -> all four keys still None (R1 F10)
# ──────────────────────────────────────────────────────────────

class TestPartialFailureKeepsDefaults:
    def test_assess_test_code_raises_finding_still_has_keys(self, monkeypatch):
        """R1 F10: monkeypatch assess_test_code_recognition to raise; verify
        that _with_defaults already seeded the four keys to None, so the
        finding is still structurally valid after enrich_findings()."""
        def _boom(*args, **kwargs):
            raise RuntimeError("synthetic")

        monkeypatch.setattr(fp, "assess_test_code_recognition", _boom)

        findings = [_base("LB", "ALT", specimen="SERUM")]
        out = fp.enrich_findings(findings)
        assert len(out) == 1
        f = out[0]
        # _with_defaults ran first so the keys exist
        for key in (
            "test_code_recognition_level",
            "test_code_recognition_reason",
            "organ_recognition_level",
            "organ_norm_tier",
        ):
            assert key in f
            assert f[key] is None
        # Enrichment recorded the error
        assert f.get("_enrichment_error") == "synthetic"


# ──────────────────────────────────────────────────────────────
# Paired-nullness invariant (AC-9)
# ──────────────────────────────────────────────────────────────

class TestPairedNullnessInvariant:
    @pytest.mark.parametrize("domain,test_code", [
        ("LB", "ALT"),
        ("LB", "ALAT"),
        ("LB", "XYZZY"),
        ("MI", "HYPERPLASIA"),
        ("LB", ""),
    ])
    def test_canonical_and_level_move_together(self, domain, test_code):
        f = _with_defaults(_base(domain, test_code))
        f = _enrich_finding(f)
        ct = f["canonical_testcd"]
        lvl = f["test_code_recognition_level"]
        # Invariant: either both are None, or both are non-None
        assert (ct is None) == (lvl is None), (
            f"Paired-nullness violated: canonical_testcd={ct!r}, "
            f"test_code_recognition_level={lvl!r}"
        )
