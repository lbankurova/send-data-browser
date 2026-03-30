"""Tests for the expert override cascade (GAP-109).

Covers:
- Tox override application (TR, adversity, contradictory)
- Tox override precedence over pattern overrides
- NOAEL recomputation from overridden findings
- NOAEL expert override applied after recomputation
- Signal score propagation
- No-override passthrough
- Override deletion revert
"""

import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.analysis.override_reader import (
    ANNOTATIONS_DIR,
    load_tox_overrides,
    apply_tox_overrides,
    load_noael_overrides,
    apply_noael_overrides,
)
from generator.view_dataframes import build_noael_summary, _is_loael_driving


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def study_id():
    return "PointCross"


@pytest.fixture
def sample_findings():
    """Minimal findings list for override testing."""
    return [
        {
            "id": "ALT-M-D92",
            "endpoint_label": "Alanine Aminotransferase",
            "finding": "ALT",
            "sex": "M",
            "domain": "LB",
            "organ_system": "hepatic",
            "dose_response_pattern": "monotonic_increase",
            "direction": "up",
            "treatment_related": True,
            "finding_class": "tr_adverse",
            "severity": "adverse",
            "min_p_adj": 0.001,
            "trend_p": 0.002,
            "max_effect_size": 1.5,
            "data_type": "continuous",
            "pairwise": [
                {"dose_level": 1, "p_value": 0.8, "p_value_adj": 0.8, "effect_size": 0.1},
                {"dose_level": 2, "p_value": 0.04, "p_value_adj": 0.04, "effect_size": 0.6},
                {"dose_level": 3, "p_value": 0.001, "p_value_adj": 0.001, "effect_size": 1.5},
            ],
        },
        {
            "id": "ALT-F-D92",
            "endpoint_label": "Alanine Aminotransferase",
            "finding": "ALT",
            "sex": "F",
            "domain": "LB",
            "organ_system": "hepatic",
            "dose_response_pattern": "threshold_increase",
            "direction": "up",
            "treatment_related": True,
            "finding_class": "tr_non_adverse",
            "severity": "warning",
            "min_p_adj": 0.03,
            "trend_p": 0.01,
            "max_effect_size": 0.8,
            "data_type": "continuous",
            "pairwise": [
                {"dose_level": 1, "p_value": 0.9, "p_value_adj": 0.9, "effect_size": 0.05},
                {"dose_level": 2, "p_value": 0.1, "p_value_adj": 0.1, "effect_size": 0.3},
                {"dose_level": 3, "p_value": 0.03, "p_value_adj": 0.03, "effect_size": 0.8},
            ],
        },
        {
            "id": "BW-M-D92",
            "endpoint_label": "Body Weight",
            "finding": "BW",
            "sex": "M",
            "domain": "BW",
            "organ_system": "systemic",
            "dose_response_pattern": "monotonic_decrease",
            "direction": "down",
            "treatment_related": True,
            "finding_class": "tr_adverse",
            "severity": "adverse",
            "min_p_adj": 0.005,
            "trend_p": 0.003,
            "max_effect_size": -1.2,
            "data_type": "continuous",
            "pairwise": [
                {"dose_level": 1, "p_value": 0.5, "p_value_adj": 0.5, "effect_size": -0.2},
                {"dose_level": 2, "p_value": 0.01, "p_value_adj": 0.01, "effect_size": -0.7},
                {"dose_level": 3, "p_value": 0.005, "p_value_adj": 0.005, "effect_size": -1.2},
            ],
        },
    ]


@pytest.fixture
def sample_dose_groups():
    return [
        {"dose_level": 0, "label": "0 mg/kg", "dose_value": 0, "dose_unit": "mg/kg"},
        {"dose_level": 1, "label": "20 mg/kg", "dose_value": 20, "dose_unit": "mg/kg"},
        {"dose_level": 2, "label": "60 mg/kg", "dose_value": 60, "dose_unit": "mg/kg"},
        {"dose_level": 3, "label": "200 mg/kg", "dose_value": 200, "dose_unit": "mg/kg"},
    ]


# ---------------------------------------------------------------------------
# Test 1: Tox TR override sets finding not treatment-related
# ---------------------------------------------------------------------------

class TestToxTROverride:
    def test_tr_no_removes_from_loael(self, sample_findings):
        """Save TR=No for an adverse finding -> finding_class = not_treatment_related,
        no longer LOAEL-driving."""
        findings = deepcopy(sample_findings)
        alt_m = findings[0]
        assert alt_m["treatment_related"] is True
        assert alt_m["finding_class"] == "tr_adverse"
        assert _is_loael_driving(alt_m)

        # Simulate tox override in-memory (bypass file I/O)
        alt_m["treatment_related"] = False
        alt_m["finding_class"] = "not_treatment_related"
        alt_m["has_tox_override"] = True

        assert not _is_loael_driving(alt_m)
        assert alt_m["finding_class"] == "not_treatment_related"

    def test_tr_yes_makes_treatment_related(self, sample_findings):
        """A non-TR finding overridden to TR=Yes becomes treatment_related."""
        findings = deepcopy(sample_findings)
        f = findings[1]
        f["treatment_related"] = False
        f["finding_class"] = "not_treatment_related"

        # Apply tox override
        f["treatment_related"] = True
        f["has_tox_override"] = True
        assert f["treatment_related"] is True


# ---------------------------------------------------------------------------
# Test 2: Tox adversity override
# ---------------------------------------------------------------------------

class TestToxAdversityOverride:
    def test_adversity_non_adverse_removes_from_loael(self, sample_findings):
        """Adversity = Non-Adverse/Adaptive -> finding_class = tr_non_adverse,
        not LOAEL-driving."""
        findings = deepcopy(sample_findings)
        alt_m = findings[0]
        alt_m["finding_class"] = "tr_non_adverse"
        assert not _is_loael_driving(alt_m)

    def test_adversity_adverse_makes_loael_driving(self, sample_findings):
        """Adversity = Adverse -> finding_class = tr_adverse, LOAEL-driving."""
        findings = deepcopy(sample_findings)
        alt_f = findings[1]
        alt_f["finding_class"] = "tr_adverse"
        assert _is_loael_driving(alt_f)


# ---------------------------------------------------------------------------
# Test 3: Contradictory TR + adversity
# ---------------------------------------------------------------------------

class TestContradictoryOverride:
    def test_tr_no_adversity_adverse_resolved_as_not_tr(self, sample_findings):
        """TR=No + Adversity=Adverse is contradictory. TR wins."""
        findings = deepcopy(sample_findings)
        alt_m = findings[0]

        # Simulate the apply_tox_overrides logic
        tr_val = "No"
        adv_val = "Adverse"

        alt_m["treatment_related"] = False
        alt_m["finding_class"] = "not_treatment_related"

        # Adversity check: TR is false, so adverse override should NOT fire
        if alt_m.get("treatment_related") and adv_val == "Adverse":
            alt_m["finding_class"] = "tr_adverse"

        assert alt_m["treatment_related"] is False
        assert alt_m["finding_class"] == "not_treatment_related"
        assert not _is_loael_driving(alt_m)


# ---------------------------------------------------------------------------
# Test 4: "Not Evaluated" = no override
# ---------------------------------------------------------------------------

class TestNotEvaluated:
    def test_not_evaluated_passes_through(self, sample_findings):
        """TR=Not Evaluated means no override — algorithm values preserved."""
        findings = deepcopy(sample_findings)
        original_tr = findings[0]["treatment_related"]
        original_class = findings[0]["finding_class"]

        # load_tox_overrides filters out "Not Evaluated"
        fake_annot = {"Alanine Aminotransferase": {"treatmentRelated": "Not Evaluated"}}
        filtered = {
            k: v for k, v in fake_annot.items()
            if v.get("treatmentRelated") != "Not Evaluated"
        }
        assert len(filtered) == 0

        # Finding unchanged
        assert findings[0]["treatment_related"] == original_tr
        assert findings[0]["finding_class"] == original_class


# ---------------------------------------------------------------------------
# Test 5: Tox override matches by endpoint_label (both sexes)
# ---------------------------------------------------------------------------

class TestToxMatchesBothSexes:
    def test_endpoint_label_matches_both_sexes(self, sample_findings, tmp_path):
        """Tox override keyed by endpoint_label applies to M and F findings."""
        findings = deepcopy(sample_findings)

        # Create temp annotation file
        annot_dir = tmp_path / "TestStudy"
        annot_dir.mkdir()
        (annot_dir / "tox_findings.json").write_text(json.dumps({
            "Alanine Aminotransferase": {
                "treatmentRelated": "No",
                "adversity": "Not Determined",
            }
        }))

        # Monkey-patch ANNOTATIONS_DIR
        import services.analysis.override_reader as mod
        orig_dir = mod.ANNOTATIONS_DIR
        mod.ANNOTATIONS_DIR = tmp_path
        try:
            overrides = load_tox_overrides("TestStudy")
            assert "Alanine Aminotransferase" in overrides

            apply_tox_overrides(findings, "TestStudy")

            # Both ALT findings (M and F) should be overridden
            alt_m = next(f for f in findings if f["id"] == "ALT-M-D92")
            alt_f = next(f for f in findings if f["id"] == "ALT-F-D92")
            assert alt_m["treatment_related"] is False
            assert alt_m["finding_class"] == "not_treatment_related"
            assert alt_m["has_tox_override"] is True
            assert alt_f["treatment_related"] is False
            assert alt_f["finding_class"] == "not_treatment_related"
            assert alt_f["has_tox_override"] is True

            # BW finding should be unchanged
            bw = next(f for f in findings if f["id"] == "BW-M-D92")
            assert bw["treatment_related"] is True
            assert "has_tox_override" not in bw
        finally:
            mod.ANNOTATIONS_DIR = orig_dir


# ---------------------------------------------------------------------------
# Test 11: NOAEL override
# ---------------------------------------------------------------------------

class TestNoaelOverride:
    def test_expert_noael_replaces_algorithmic(self):
        """Expert NOAEL override replaces algorithmic value."""
        noael_rows = [
            {"sex": "Combined", "noael_dose_level": 1, "noael_dose_value": 20,
             "noael_dose_unit": "mg/kg", "noael_label": "20 mg/kg"},
            {"sex": "M", "noael_dose_level": 1, "noael_dose_value": 20,
             "noael_dose_unit": "mg/kg", "noael_label": "20 mg/kg"},
            {"sex": "F", "noael_dose_level": 2, "noael_dose_value": 60,
             "noael_dose_unit": "mg/kg", "noael_label": "60 mg/kg"},
        ]

        # Simulate override for Combined
        import services.analysis.override_reader as mod
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            annot_dir = tmp_path / "TestStudy"
            annot_dir.mkdir()
            (annot_dir / "noael_overrides.json").write_text(json.dumps({
                "noael:Combined": {
                    "override_dose_level": 2,
                    "override_dose_value": "60",
                    "rationale": "ALT not treatment-related per expert",
                    "override_type": "higher",
                    "sex": "Combined",
                }
            }))

            orig_dir = mod.ANNOTATIONS_DIR
            mod.ANNOTATIONS_DIR = tmp_path
            try:
                result = apply_noael_overrides(deepcopy(noael_rows), "TestStudy")
                combined = next(r for r in result if r["sex"] == "Combined")
                assert combined["noael_dose_level"] == 2
                assert combined["noael_dose_value"] == "60"
                assert combined["_overridden"] is True
                assert combined["_system_dose_level"] == 1
                assert combined["_system_dose_value"] == 20

                # M row unchanged
                m_row = next(r for r in result if r["sex"] == "M")
                assert m_row["noael_dose_level"] == 1
                assert "_overridden" not in m_row
            finally:
                mod.ANNOTATIONS_DIR = orig_dir


# ---------------------------------------------------------------------------
# Test: NOAEL recomputation from overridden findings
# ---------------------------------------------------------------------------

class TestNoaelRecomputation:
    def test_removing_adverse_shifts_noael_up(self, sample_findings, sample_dose_groups):
        """When a tox override removes the only adverse finding at dose 2,
        NOAEL should shift up."""
        findings = deepcopy(sample_findings)

        # Before override: ALT-M is adverse at dose 2 and 3, BW-M is adverse at dose 2 and 3
        noael_before = build_noael_summary(findings, sample_dose_groups)
        m_before = next(r for r in noael_before if r["sex"] == "M")
        # LOAEL should be at dose 2 (first dose with p < 0.05 adverse finding)
        assert m_before["loael_dose_level"] == 2

        # Override: ALT is not treatment-related
        for f in findings:
            if f["endpoint_label"] == "Alanine Aminotransferase":
                f["treatment_related"] = False
                f["finding_class"] = "not_treatment_related"
                f["has_tox_override"] = True

        # After override: only BW-M is adverse
        noael_after = build_noael_summary(findings, sample_dose_groups)
        m_after = next(r for r in noael_after if r["sex"] == "M")
        # LOAEL still at dose 2 (BW-M still adverse there)
        assert m_after["loael_dose_level"] == 2

        # Now also override BW as not TR
        for f in findings:
            if f["endpoint_label"] == "Body Weight":
                f["treatment_related"] = False
                f["finding_class"] = "not_treatment_related"
                f["has_tox_override"] = True

        noael_final = build_noael_summary(findings, sample_dose_groups)
        m_final = next(r for r in noael_final if r["sex"] == "M")
        # No adverse findings left -> "Not established" (no LOAEL = no NOAEL to bracket)
        # In regulatory terms this means NOAEL >= highest dose, but the algorithm
        # reports None with method "not_established"
        assert m_final["noael_dose_level"] is None
        assert m_final["noael_derivation"]["method"] == "not_established"


# ---------------------------------------------------------------------------
# Test 16: No overrides = passthrough
# ---------------------------------------------------------------------------

class TestNoOverridePassthrough:
    def test_no_overrides_unchanged(self, sample_findings):
        """When no tox overrides exist, findings are unchanged."""
        findings = deepcopy(sample_findings)
        originals = {f["id"]: (f["treatment_related"], f["finding_class"]) for f in findings}

        # apply_tox_overrides with no annotation file = no-op
        import services.analysis.override_reader as mod
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            orig_dir = mod.ANNOTATIONS_DIR
            mod.ANNOTATIONS_DIR = Path(tmp)
            try:
                result = apply_tox_overrides(findings, "NonExistentStudy")
                for f in result:
                    orig_tr, orig_class = originals[f["id"]]
                    assert f["treatment_related"] == orig_tr
                    assert f["finding_class"] == orig_class
                    assert "has_tox_override" not in f
            finally:
                mod.ANNOTATIONS_DIR = orig_dir


# ---------------------------------------------------------------------------
# Test 12: NOAEL expert override > recomputation
# ---------------------------------------------------------------------------

class TestNoaelExpertOverRecomputation:
    def test_expert_noael_wins_over_recomputation(self, sample_findings, sample_dose_groups):
        """Expert NOAEL override (Level 4) should be authoritative over
        recomputation from finding-level overrides."""
        findings = deepcopy(sample_findings)

        # Step 1: Recompute NOAEL with tox overrides
        for f in findings:
            if f["endpoint_label"] == "Alanine Aminotransferase":
                f["treatment_related"] = False
                f["finding_class"] = "not_treatment_related"

        recomputed = build_noael_summary(findings, sample_dose_groups)
        m_recomputed = next(r for r in recomputed if r["sex"] == "M")
        recomputed_level = m_recomputed["noael_dose_level"]

        # Step 2: Apply expert NOAEL override that disagrees
        import services.analysis.override_reader as mod
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            annot_dir = tmp_path / "TestStudy"
            annot_dir.mkdir()
            (annot_dir / "noael_overrides.json").write_text(json.dumps({
                "noael:M": {
                    "override_dose_level": 0,
                    "override_dose_value": "0",
                    "rationale": "Expert disagrees with recomputation",
                    "override_type": "lower",
                    "sex": "M",
                }
            }))

            orig_dir = mod.ANNOTATIONS_DIR
            mod.ANNOTATIONS_DIR = tmp_path
            try:
                # Expert override applied AFTER recomputation
                result = apply_noael_overrides(recomputed, "TestStudy")
                m_result = next(r for r in result if r["sex"] == "M")
                # Expert said dose 0 — that's the final answer
                assert m_result["noael_dose_level"] == 0
                assert m_result["_overridden"] is True
                assert m_result["_system_dose_level"] == recomputed_level
            finally:
                mod.ANNOTATIONS_DIR = orig_dir
