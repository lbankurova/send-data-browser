"""Tests for the protective syndrome detection engine (R18-R25).

Covers: catalog validation, N-tier routing, PEX gates, inference gate,
negative-control suite across corpus studies.

NTP TR-598 fixture-driven positive-control tests are deferred until the
hand-encoded fixture is complete (DATA-GAP-PROT-06).
"""

import json
import os
import pytest
from pathlib import Path

# ---------------------------------------------------------------------------
# Catalog validation (Feature 1 — AC-1.1 through AC-1.5)
# ---------------------------------------------------------------------------

CATALOG_PATH = Path(__file__).parent.parent.parent / "shared" / "rules" / "protective-syndromes.json"


def _load_catalog():
    with open(CATALOG_PATH) as f:
        return json.load(f)


class TestCatalogSchema:
    """Validate protective-syndromes.json completeness."""

    def test_catalog_has_8_rules(self):
        cat = _load_catalog()
        assert len(cat["rules"]) == 8

    def test_all_rules_have_required_fields(self):
        cat = _load_catalog()
        required_fields = {
            "syndromeId", "name", "direction", "minDomains",
            "requiredLogic", "magnitudeFloors", "pexChecks",
            "confidence_ceiling", "citation",
        }
        for rule in cat["rules"]:
            missing = required_fields - set(rule.keys())
            assert not missing, f"{rule['syndromeId']} missing fields: {missing}"

    def test_all_rules_have_decreasing_or_mixed_direction(self):
        cat = _load_catalog()
        for rule in cat["rules"]:
            assert rule["direction"] in ("decreasing", "mixed"), (
                f"{rule['syndromeId']} has direction={rule['direction']}"
            )

    def test_r18_r24_have_species_scope(self):
        """AC-1.3: R18-R24 have species_scope and/or strain_scope."""
        cat = _load_catalog()
        for rule in cat["rules"]:
            sid = rule["syndromeId"]
            if sid in ("R18", "R19"):
                assert rule.get("species_scope") == ["RAT", "MOUSE"], (
                    f"{sid} missing species_scope"
                )
            elif sid in ("R21", "R22"):
                assert rule.get("species_scope") == ["RAT"], (
                    f"{sid} missing species_scope"
                )

    def test_r18_r19_have_adverse_compatible_with(self):
        """AC-1.4: R18 and R19 have adverse_compatible_with entries with citations."""
        cat = _load_catalog()
        for rule in cat["rules"]:
            sid = rule["syndromeId"]
            if sid == "R18":
                compat = rule.get("adverse_compatible_with", [])
                assert len(compat) >= 1, "R18 must have adverse_compatible_with"
                assert compat[0]["adverse_syndrome_id"] == "XS01"
                assert "citation" in compat[0]
            elif sid == "R19":
                compat = rule.get("adverse_compatible_with", [])
                assert len(compat) >= 1, "R19 must have adverse_compatible_with (thyroid D3 overlap)"
                assert compat[0]["adverse_syndrome_id"] == "XS03"
                assert "citation" in compat[0]

    def test_r25_has_blocked_on(self):
        """AC-1.5: R25 has blocked_on marker."""
        cat = _load_catalog()
        r25 = next(r for r in cat["rules"] if r["syndromeId"] == "R25")
        assert r25.get("blocked_on") == "S20_compound_profiles"

    def test_evidence_tiers_defined(self):
        cat = _load_catalog()
        tiers = cat["evidence_tiers"]
        assert set(tiers.keys()) == {"suppressed", "descriptive_only", "inference"}
        assert tiers["suppressed"]["feeds_noael"] is False
        assert tiers["descriptive_only"]["feeds_noael"] is False
        assert tiers["inference"]["feeds_noael"] is True

    def test_statistical_gate_defined(self):
        cat = _load_catalog()
        gate = cat["statistical_gate"]
        assert gate["boschloo_p_threshold"] == 0.05
        assert gate["bayesian_posterior_threshold"] == 0.95
        assert gate["spared_cases_min"] == 2


# ---------------------------------------------------------------------------
# N-tier routing (Feature 3 — AC-3.1 through AC-3.4)
# ---------------------------------------------------------------------------

from generator.protective_syndromes import (
    build_protective_syndromes,
    _determine_evidence_tier,
    _boschloo_one_sided,
)


class TestNTierRouting:

    def test_n3_suppressed(self):
        """AC-3.1: N=3 per group produces zero matches and suppression banner."""
        dgs = [{"dose_level": 0, "n": 3}, {"dose_level": 1, "n": 3}]
        result = build_protective_syndromes([], dgs)
        assert result["evidence_tier"] == "suppressed"
        assert result["status"] == "PROT_SUPPRESSED_N_LT_5"
        assert len(result["protective_syndromes"]) == 0
        assert "N>=5" in result["suppression_banner"]

    def test_n6_descriptive(self):
        """AC-3.2: N=6 produces descriptive_only tier."""
        dgs = [{"dose_level": 0, "n": 6}, {"dose_level": 1, "n": 6}]
        result = build_protective_syndromes([], dgs, species="RAT")
        assert result["evidence_tier"] == "descriptive_only"

    def test_n10_inference(self):
        """AC-3.3: N=10 produces inference tier."""
        dgs = [{"dose_level": 0, "n": 10}, {"dose_level": 1, "n": 10}]
        result = build_protective_syndromes([], dgs, species="RAT")
        assert result["evidence_tier"] == "inference"

    def test_crossover_not_supported(self):
        """AC-7.5: Crossover/latin square designs get PROT_DESIGN_NOT_SUPPORTED."""
        dgs = [{"dose_level": 0, "n": 10}, {"dose_level": 1, "n": 10}]
        result = build_protective_syndromes(
            [], dgs, design_type="within_animal_crossover"
        )
        assert result["status"] == "PROT_DESIGN_NOT_SUPPORTED"

    def test_satellite_excluded(self):
        """Satellite groups are excluded from N-tier routing."""
        dgs = [
            {"dose_level": 0, "n": 10},
            {"dose_level": 1, "n": 10},
            {"dose_level": 1, "n": 3, "is_satellite": True},
        ]
        tier, _, _ = _determine_evidence_tier(dgs)
        assert tier == "inference"

    def test_pipeline_dose_groups(self):
        """Pipeline dose_groups use n_male/n_female instead of n."""
        dgs = [
            {"dose_level": 0, "n_male": 10, "n_female": 10, "is_control": True},
            {"dose_level": 1, "n_male": 10, "n_female": 10},
            {"dose_level": 2, "n_male": 10, "n_female": 10},
        ]
        tier, treat_n, ctrl_n = _determine_evidence_tier(dgs)
        assert tier == "inference"
        assert treat_n == 10
        assert ctrl_n == 10


# ---------------------------------------------------------------------------
# PEX gates (Feature 4 — AC-4.1 through AC-4.7)
# ---------------------------------------------------------------------------

from services.analysis.clinical_catalog import _check_protective_exclusion


class TestPEXGates:

    def test_pex05a_exists(self):
        """AC-4.1: PEX05a exists and old PEX05 name is gone."""
        result = {"params": {"n_affected": 1}, "organ_system": "hepatic"}
        excluded, pex_id = _check_protective_exclusion(result, None)
        assert excluded is True
        assert pex_id == "PEX05a"

    def test_pex08_subchronic_mortality_fires(self):
        """AC-4.2: PEX08 fires when treated mortality >0% in subchronic."""
        result = {"params": {"n_affected": 5, "ctrl_pct": "50"}, "organ_system": "hepatic"}
        ctx = {"mortality_pct": 5, "study_type": "subchronic"}
        excluded, pex_id = _check_protective_exclusion(result, None, rule_id="R20", study_context=ctx)
        assert excluded is True
        assert pex_id == "PEX08"

    def test_pex08_subchronic_zero_mortality_passes(self):
        """AC-4.2: PEX08 does not fire when mortality is 0%."""
        result = {"params": {"n_affected": 5, "ctrl_pct": "50"}, "organ_system": "hepatic"}
        ctx = {"mortality_pct": 0, "study_type": "subchronic"}
        excluded, pex_id = _check_protective_exclusion(result, None, rule_id="R20", study_context=ctx)
        assert pex_id != "PEX08"

    def test_pex09_fires_on_bw_loss_20pct(self):
        """AC-4.3: PEX09 fires on BW loss >20%."""
        result = {"params": {"n_affected": 5, "ctrl_pct": "50"}, "organ_system": "hepatic"}
        ctx = {"bw_loss_pct": 25, "mortality_pct": 5, "study_type": "chronic"}
        excluded, pex_id = _check_protective_exclusion(result, None, rule_id="R21", study_context=ctx)
        assert excluded is True
        assert pex_id == "PEX09"

    def test_pex09_passes_on_bw_loss_18pct(self):
        """AC-4.3: PEX09 does not fire on BW loss of 18%."""
        result = {"params": {"n_affected": 5, "ctrl_pct": "50"}, "organ_system": "hepatic"}
        ctx = {"bw_loss_pct": 18, "mortality_pct": 5, "study_type": "chronic"}
        excluded, pex_id = _check_protective_exclusion(result, None, rule_id="R21", study_context=ctx)
        assert pex_id != "PEX09"

    def test_pex09_no_adverse_syndrome_reference(self):
        """AC-4.4: PEX09 does NOT reference any adverse syndrome confidence."""
        # PEX09 uses only: bw_loss_pct, mortality_pct, dose_groups_with_decedents
        import inspect
        src = inspect.getsource(_check_protective_exclusion)
        # Check the PEX09 section doesn't reference adverse_syndrome or syndrome_confidence
        pex09_start = src.index("PEX09")
        pex09_end = src.index("PEX10", pex09_start)
        pex09_code = src[pex09_start:pex09_end]
        assert "adverse_syndrome" not in pex09_code.lower()
        assert "syndrome_confidence" not in pex09_code.lower()

    def test_pex10_fires_on_combined_criterion(self):
        """AC-4.5: PEX10 fires on combined BW>5% AND food>10% AND lipid down."""
        result = {"params": {"n_affected": 5, "ctrl_pct": "50"}, "organ_system": "hepatic"}
        ctx = {"bw_loss_pct": 7, "food_decrease_pct": 12, "lb_lipid_down": True}
        excluded, pex_id = _check_protective_exclusion(result, None, rule_id="R23", study_context=ctx)
        assert excluded is True
        assert pex_id == "PEX10"

    def test_pex02_r20_carveout(self):
        """AC-4.6: PEX02 does NOT fire for R20 with neoplastic finding."""
        result = {"params": {"finding": "ADENOMA", "n_affected": 5, "ctrl_pct": "50"}, "organ_system": "hepatic"}
        excluded, pex_id = _check_protective_exclusion(result, None, rule_id="R20")
        assert pex_id != "PEX02"

    def test_r18_r19_r23_r25_not_gated_by_pex08_pex09(self):
        """AC-4.7: R18/R19/R23/R25 are NOT gated by PEX08/PEX09."""
        result = {"params": {"n_affected": 5, "ctrl_pct": "50"}, "organ_system": "hepatic"}
        ctx = {"mortality_pct": 50, "bw_loss_pct": 50, "study_type": "subchronic"}
        for rid in ["R18", "R19", "R23", "R25"]:
            _, pex_id = _check_protective_exclusion(result, None, rule_id=rid, study_context=ctx)
            assert pex_id not in ("PEX08", "PEX09"), f"{rid} should not be gated by PEX08/PEX09"


# ---------------------------------------------------------------------------
# Threshold calibration (Feature 5 — AC-5.1 through AC-5.5)
# ---------------------------------------------------------------------------

THRESHOLDS_PATH = Path(__file__).parent.parent.parent / "shared" / "config" / "thresholds.json"


class TestThresholdCalibration:

    def _load(self):
        with open(THRESHOLDS_PATH) as f:
            return json.load(f)["protective_signal"]

    def test_magnitude_floor_is_20(self):
        """AC-5.1"""
        assert self._load()["magnitude_floor_pp"] == 20

    def test_per_rule_magnitude_overrides(self):
        """AC-5.2"""
        overrides = self._load()["magnitude_floor_pp_overrides"]
        assert overrides == {"R20": 25, "R21": 30, "R22": 20, "R24": 25}

    def test_per_rule_control_incidence_overrides(self):
        """AC-5.3"""
        overrides = self._load()["control_incidence_floor_pct_overrides"]
        assert overrides == {"R20": 20, "R21": 30, "R22": 15}

    def test_high_confidence_thresholds(self):
        """AC-5.4"""
        ps = self._load()
        assert ps["high_confidence_ctrl_inc_pct"] == 50
        assert ps["high_confidence_drop_pp"] == 40

    def test_deprecated_keys_removed(self):
        """AC-5.5: deprecated keys removed after ProtectiveSignalsBar retirement."""
        ps = self._load()
        assert "min_cross_domain_correlates" not in ps
        assert "min_moderate_correlates" not in ps
        assert "repurposing_ctrl_inc_pct" not in ps
        assert "repurposing_large_drop_pct" not in ps


# ---------------------------------------------------------------------------
# Boschloo one-sided gate
# ---------------------------------------------------------------------------

class TestBoschlooOneSided:

    def test_strong_signal_3_5_vs_0_5(self):
        """3/5 vs 0/5: should be significant (p<0.05)."""
        p = _boschloo_one_sided(0, 5, 3, 5)
        assert p < 0.05, f"Expected p<0.05, got {p}"

    def test_weak_signal_2_5_vs_1_5(self):
        """2/5 vs 1/5: should NOT be significant."""
        p = _boschloo_one_sided(1, 5, 2, 5)
        assert p >= 0.05, f"Expected p>=0.05, got {p}"


# ---------------------------------------------------------------------------
# Empty input returns empty (AC-2.1)
# ---------------------------------------------------------------------------

class TestEmptyInput:

    def test_empty_findings_returns_empty(self):
        """AC-2.1: Backend detection returns empty array when no patterns match."""
        dgs = [{"dose_level": 0, "n": 10}, {"dose_level": 1, "n": 10}]
        result = build_protective_syndromes([], dgs, species="RAT")
        assert result["protective_syndromes"] == []


# ---------------------------------------------------------------------------
# Negative-control suite — corpus studies (Feature 7 — AC-7.4)
# ---------------------------------------------------------------------------

GENERATED_DIR = Path(__file__).parent.parent / "generated"


class TestNegativeControlCorpus:
    """Zero inference-tier firings across N>=8 studies in the corpus.

    This is a fixture-driven test that loads real generated output.
    """

    def _get_corpus_studies(self):
        """List all studies with generated protective_syndromes.json."""
        if not GENERATED_DIR.exists():
            return []
        studies = []
        for d in GENERATED_DIR.iterdir():
            if d.is_dir() and (d / "protective_syndromes.json").exists():
                studies.append(d.name)
        return sorted(studies)

    def test_no_inference_firings_on_corpus(self):
        """AC-7.4: Zero inference-tier protective syndrome firings across corpus."""
        studies = self._get_corpus_studies()
        if not studies:
            pytest.skip("No generated studies found")

        failures = []
        for study_id in studies:
            path = GENERATED_DIR / study_id / "protective_syndromes.json"
            with open(path) as f:
                data = json.load(f)

            tier = data.get("evidence_tier", "")
            matches = data.get("protective_syndromes", [])

            # Only check inference-tier firings
            inference_matches = [
                m for m in matches if m.get("evidence_tier") == "inference"
            ]
            if inference_matches:
                failures.append(
                    f"{study_id}: {len(inference_matches)} inference-tier matches "
                    f"({[m['syndromeId'] for m in inference_matches]})"
                )

        assert not failures, (
            f"Unexpected inference-tier protective firings:\n"
            + "\n".join(failures)
        )
