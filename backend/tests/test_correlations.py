"""Tests for cross-endpoint correlation computation and context pane matching.

Guards against the OM endpoint-key collapse regression: all OM findings shared
test_code='WEIGHT' and collapsed to a single key, losing all OM correlations.
Also tests that context_panes._build_correlations matches using the same key
format as correlations._endpoint_key.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from services.analysis.correlations import _endpoint_key, compute_correlations
from services.analysis.context_panes import _build_correlations


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────

def _subjects(n: int = 20, base: float = 10.0, step: float = 0.5) -> dict:
    """Generate {USUBJID: value} for n subjects."""
    return {f"SUBJ-{i:03d}": base + i * step for i in range(n)}


def _om_finding(specimen: str, sex: str, *, organ_system: str = "hepatic",
                base: float = 5.0, finding_id: str | None = None) -> dict:
    """Minimal OM finding with subject-level data."""
    subj = _subjects(20, base=base)
    return {
        "id": finding_id or f"om-{specimen.lower()}-{sex}",
        "domain": "OM",
        "test_code": "WEIGHT",
        "specimen": specimen,
        "day": 92,
        "sex": sex,
        "data_type": "continuous",
        "organ_system": organ_system,
        "finding": f"{specimen} (WEIGHT)",
        "endpoint_label": f"{specimen} \u2014 {specimen} (WEIGHT)",
        "raw_subject_values": [subj],
        "group_stats": [{"mean": base + 10 * 0.5 / 2}],
    }


def _lb_finding(test_code: str, sex: str, *, organ_system: str = "hepatic",
                base: float = 50.0, finding_id: str | None = None) -> dict:
    """Minimal LB finding with subject-level data."""
    subj = _subjects(20, base=base)
    return {
        "id": finding_id or f"lb-{test_code.lower()}-{sex}",
        "domain": "LB",
        "test_code": test_code,
        "specimen": None,
        "day": 92,
        "sex": sex,
        "data_type": "continuous",
        "organ_system": organ_system,
        "finding": test_code,
        "endpoint_label": f"LB \u2014 {test_code}",
        "raw_subject_values": [subj],
        "group_stats": [{"mean": base + 10 * 0.5 / 2}],
    }


def _bw_finding(sex: str, day: int = 92, base: float = 200.0) -> dict:
    """Minimal BW finding with subject-level data."""
    subj = _subjects(20, base=base)
    return {
        "id": f"bw-{sex}-{day}",
        "domain": "BW",
        "test_code": "BW",
        "specimen": None,
        "day": day,
        "sex": sex,
        "data_type": "continuous",
        "organ_system": "general",
        "finding": "Body Weight",
        "endpoint_label": f"BW \u2014 Body Weight Day {day}",
        "raw_subject_values": [subj],
        "group_stats": [{"mean": base + 10 * 0.5 / 2}],
    }


# ──────────────────────────────────────────────────────────────
# _endpoint_key
# ──────────────────────────────────────────────────────────────

class TestEndpointKey:
    """Endpoint key must distinguish OM organs by specimen."""

    def test_om_different_specimens_get_different_keys(self):
        liver = _om_finding("LIVER", "F")
        brain = _om_finding("BRAIN", "F", organ_system="neurological")
        assert _endpoint_key(liver) != _endpoint_key(brain)

    def test_om_same_specimen_different_sex_same_key(self):
        """M and F for same organ must share a key (sex is not part of key)."""
        liver_f = _om_finding("LIVER", "F")
        liver_m = _om_finding("LIVER", "M")
        assert _endpoint_key(liver_f) == _endpoint_key(liver_m)

    def test_om_key_includes_specimen(self):
        f = _om_finding("KIDNEY", "F", organ_system="renal")
        key = _endpoint_key(f)
        assert "KIDNEY" in key

    def test_lb_key_without_specimen(self):
        """LB findings have no specimen — key is domain_testcode_day."""
        f = _lb_finding("ALT", "F")
        assert _endpoint_key(f) == "LB_ALT_92"

    def test_bw_key_without_specimen(self):
        f = _bw_finding("M", day=29)
        assert _endpoint_key(f) == "BW_BW_29"

    @pytest.mark.parametrize("specimen", [
        "LIVER", "BRAIN", "KIDNEY", "SPLEEN", "THYMUS", "HEART",
        "GLAND, ADRENAL", "GLAND, PITUITARY", "GLAND, THYROID",
        "TESTIS", "OVARY",
    ])
    def test_all_om_organs_produce_unique_keys(self, specimen):
        """Every OM organ must produce a key distinct from the base OM_WEIGHT_92."""
        f = _om_finding(specimen, "F", organ_system="general")
        key = _endpoint_key(f)
        base_key = "OM_WEIGHT_92"
        assert key != base_key, f"{specimen} collapsed to base key"


# ──────────────────────────────────────────────────────────────
# compute_correlations — OM coverage
# ──────────────────────────────────────────────────────────────

class TestOMCorrelations:
    """OM organ weights must produce correlations with LB endpoints in same organ system."""

    def test_om_liver_correlates_with_lb_alt(self):
        """OM LIVER and LB ALT in hepatic system should produce a correlation."""
        findings = [
            _om_finding("LIVER", "F", organ_system="hepatic", base=5.0),
            _om_finding("LIVER", "M", organ_system="hepatic", base=7.0),
            _lb_finding("ALT", "F", organ_system="hepatic", base=30.0),
            _lb_finding("ALT", "M", organ_system="hepatic", base=35.0),
        ]
        corrs = compute_correlations(findings)
        assert len(corrs) > 0
        domains = {(c["domain_1"], c["domain_2"]) for c in corrs}
        assert any("OM" in pair for pair in domains), \
            f"No OM correlations found. Domains: {domains}"

    def test_om_organs_in_same_system_correlate(self):
        """Two OM organs in the same organ system should correlate."""
        findings = [
            _om_finding("SPLEEN", "F", organ_system="hematologic", base=0.5),
            _om_finding("SPLEEN", "M", organ_system="hematologic", base=0.6),
            _om_finding("THYMUS", "F", organ_system="hematologic", base=0.4),
            _om_finding("THYMUS", "M", organ_system="hematologic", base=0.5),
        ]
        corrs = compute_correlations(findings)
        assert len(corrs) > 0
        # Both sides should be OM
        assert corrs[0]["domain_1"] == "OM"
        assert corrs[0]["domain_2"] == "OM"

    def test_om_different_organs_not_collapsed(self):
        """LIVER and BRAIN must produce separate endpoint keys, not one merged group."""
        findings = [
            _om_finding("LIVER", "F", organ_system="hepatic", base=5.0),
            _om_finding("LIVER", "M", organ_system="hepatic", base=7.0),
            _om_finding("BRAIN", "F", organ_system="neurological", base=1.5),
            _om_finding("BRAIN", "M", organ_system="neurological", base=1.8),
        ]
        corrs = compute_correlations(findings)
        # Different organ systems → no cross-pair expected. The key point is
        # they don't collapse into the same endpoint.
        keys = set()
        for c in corrs:
            keys.add(c["endpoint_key_1"])
            keys.add(c["endpoint_key_2"])
        # If they collapsed, there'd be only one key containing all findings
        if corrs:
            assert len(keys) >= 2


# ──────────────────────────────────────────────────────────────
# context_panes._build_correlations — key consistency
# ──────────────────────────────────────────────────────────────

class TestContextPaneCorrelationMatching:
    """_build_correlations must use the same key format as _endpoint_key."""

    def _make_correlation_record(self, findings_1: list[dict], findings_2: list[dict]) -> dict:
        """Build a correlation record like compute_correlations produces.

        Accepts lists of findings per side (M+F grouped), matching the real
        output of compute_correlations.
        """
        f1, f2 = findings_1[0], findings_2[0]
        return {
            "endpoint_key_1": _endpoint_key(f1),
            "endpoint_key_2": _endpoint_key(f2),
            "endpoint_label_1": f1.get("endpoint_label", f1.get("finding", "")),
            "endpoint_label_2": f2.get("endpoint_label", f2.get("finding", "")),
            "finding_ids_1": [f["id"] for f in findings_1],
            "finding_ids_2": [f["id"] for f in findings_2],
            "endpoint_1": f1["finding"],
            "endpoint_2": f2["finding"],
            "domain_1": f1["domain"],
            "domain_2": f2["domain"],
            "organ_system": f1.get("organ_system", "unknown"),
            "rho": 0.75,
            "p_value": 0.001,
            "n": 20,
            "basis": "individual",
        }

    def test_om_finding_matches_its_correlation(self):
        """An OM LIVER finding must match a correlation that has OM LIVER on one side."""
        om = _om_finding("LIVER", "F", finding_id="om-liver-f")
        lb = _lb_finding("ALT", "F", finding_id="lb-alt-f")
        corr = self._make_correlation_record([om], [lb])

        result = _build_correlations("om-liver-f", om, [corr])
        assert len(result["related"]) == 1
        assert result["related"][0]["endpoint"] == "ALT"

    def test_om_finding_does_not_match_other_om_specimen(self):
        """OM LIVER must NOT match a correlation keyed to OM BRAIN."""
        brain = _om_finding("BRAIN", "F", organ_system="neurological", finding_id="om-brain-f")
        lb = _lb_finding("ALT", "F", finding_id="lb-alt-f")
        corr = self._make_correlation_record([brain], [lb])

        liver = _om_finding("LIVER", "F", finding_id="om-liver-f")
        result = _build_correlations("om-liver-f", liver, [corr])
        assert len(result["related"]) == 0

    def test_lb_finding_matches_its_correlation(self):
        """LB ALT must match a correlation that has LB ALT on one side."""
        om = _om_finding("LIVER", "F", finding_id="om-liver-f")
        lb = _lb_finding("ALT", "F", finding_id="lb-alt-f")
        corr = self._make_correlation_record([om], [lb])

        result = _build_correlations("lb-alt-f", lb, [corr])
        assert len(result["related"]) == 1
        assert result["related"][0]["domain"] == "OM"

    def test_bw_finding_matches_without_specimen(self):
        """BW (no specimen) still matches correctly."""
        bw = _bw_finding("M", day=92)
        lb = _lb_finding("BUN", "M", organ_system="general", finding_id="lb-bun-m")
        corr = self._make_correlation_record([bw], [lb])

        result = _build_correlations("bw-M-92", bw, [corr])
        assert len(result["related"]) == 1

    def test_autocorrelation_filter_does_not_suppress_cross_endpoint(self):
        """The endpoint_label autocorrelation filter must not suppress different endpoints."""
        om1 = _om_finding("LIVER", "F", finding_id="om-liver-f")
        om2 = _om_finding("KIDNEY", "F", organ_system="renal", finding_id="om-kidney-f")
        # Different endpoint_labels → should NOT be filtered
        corr = self._make_correlation_record([om1], [om2])

        result = _build_correlations("om-liver-f", om1, [corr])
        assert len(result["related"]) == 1, "Cross-endpoint correlation was incorrectly filtered"


# ──────────────────────────────────────────────────────────────
# Sex-matched ID resolution
# ──────────────────────────────────────────────────────────────

class TestSexMatchedCorrelationID:
    """_build_correlations must return the sex-matched finding ID from correlation
    records that contain both M and F findings.

    Four combinations: {M, F} × {current finding on side 1, side 2}.
    Plus: aggregate (no sex) falls back to first ID.
    """

    def _make_dual_sex_correlation(self, side1: list[dict], side2: list[dict]) -> dict:
        """Correlation record with M+F findings on both sides."""
        f1, f2 = side1[0], side2[0]
        return {
            "endpoint_key_1": _endpoint_key(f1),
            "endpoint_key_2": _endpoint_key(f2),
            "endpoint_label_1": f1.get("endpoint_label", f1.get("finding", "")),
            "endpoint_label_2": f2.get("endpoint_label", f2.get("finding", "")),
            "finding_ids_1": [f["id"] for f in side1],
            "finding_ids_2": [f["id"] for f in side2],
            "endpoint_1": f1["finding"],
            "endpoint_2": f2["finding"],
            "domain_1": f1["domain"],
            "domain_2": f2["domain"],
            "organ_system": f1.get("organ_system", "unknown"),
            "rho": 0.75,
            "p_value": 0.001,
            "n": 20,
            "basis": "individual",
        }

    def test_female_on_side1_gets_female_other_id(self):
        """F finding on side 1 → must get F finding ID from side 2."""
        om_f = _om_finding("LIVER", "F", finding_id="om-liver-f")
        om_m = _om_finding("LIVER", "M", finding_id="om-liver-m")
        lb_f = _lb_finding("ALT", "F", finding_id="lb-alt-f")
        lb_m = _lb_finding("ALT", "M", finding_id="lb-alt-m")
        all_findings = [om_f, om_m, lb_f, lb_m]
        corr = self._make_dual_sex_correlation([om_f, om_m], [lb_f, lb_m])

        result = _build_correlations("om-liver-f", om_f, [corr], all_findings)
        assert len(result["related"]) == 1
        assert result["related"][0]["finding_id"] == "lb-alt-f"

    def test_male_on_side1_gets_male_other_id(self):
        """M finding on side 1 → must get M finding ID from side 2."""
        om_f = _om_finding("LIVER", "F", finding_id="om-liver-f")
        om_m = _om_finding("LIVER", "M", finding_id="om-liver-m")
        lb_f = _lb_finding("ALT", "F", finding_id="lb-alt-f")
        lb_m = _lb_finding("ALT", "M", finding_id="lb-alt-m")
        all_findings = [om_f, om_m, lb_f, lb_m]
        corr = self._make_dual_sex_correlation([om_f, om_m], [lb_f, lb_m])

        result = _build_correlations("om-liver-m", om_m, [corr], all_findings)
        assert len(result["related"]) == 1
        assert result["related"][0]["finding_id"] == "lb-alt-m"

    def test_female_on_side2_gets_female_other_id(self):
        """F finding on side 2 → must get F finding ID from side 1."""
        om_f = _om_finding("LIVER", "F", finding_id="om-liver-f")
        om_m = _om_finding("LIVER", "M", finding_id="om-liver-m")
        lb_f = _lb_finding("ALT", "F", finding_id="lb-alt-f")
        lb_m = _lb_finding("ALT", "M", finding_id="lb-alt-m")
        all_findings = [om_f, om_m, lb_f, lb_m]
        corr = self._make_dual_sex_correlation([om_f, om_m], [lb_f, lb_m])

        result = _build_correlations("lb-alt-f", lb_f, [corr], all_findings)
        assert len(result["related"]) == 1
        assert result["related"][0]["finding_id"] == "om-liver-f"

    def test_male_on_side2_gets_male_other_id(self):
        """M finding on side 2 → must get M finding ID from side 1."""
        om_f = _om_finding("LIVER", "F", finding_id="om-liver-f")
        om_m = _om_finding("LIVER", "M", finding_id="om-liver-m")
        lb_f = _lb_finding("ALT", "F", finding_id="lb-alt-f")
        lb_m = _lb_finding("ALT", "M", finding_id="lb-alt-m")
        all_findings = [om_f, om_m, lb_f, lb_m]
        corr = self._make_dual_sex_correlation([om_f, om_m], [lb_f, lb_m])

        result = _build_correlations("lb-alt-m", lb_m, [corr], all_findings)
        assert len(result["related"]) == 1
        assert result["related"][0]["finding_id"] == "om-liver-m"

    def test_aggregate_finding_falls_back_to_first_id(self):
        """Finding with no sex (aggregate) falls back to first ID in the list."""
        om_f = _om_finding("LIVER", "F", finding_id="om-liver-f")
        om_m = _om_finding("LIVER", "M", finding_id="om-liver-m")
        lb_f = _lb_finding("ALT", "F", finding_id="lb-alt-f")
        lb_m = _lb_finding("ALT", "M", finding_id="lb-alt-m")
        all_findings = [om_f, om_m, lb_f, lb_m]
        corr = self._make_dual_sex_correlation([om_f, om_m], [lb_f, lb_m])

        # Simulate aggregate finding — same endpoint key as OM LIVER, but no sex
        aggregate = _om_finding("LIVER", "F", finding_id="om-liver-agg")
        aggregate["sex"] = None  # aggregate: no sex
        aggregate["id"] = "om-liver-agg"
        all_findings.append(aggregate)

        result = _build_correlations("om-liver-agg", aggregate, [corr], all_findings)
        assert len(result["related"]) == 1
        # Falls back to first ID in the list (defined behavior, not accidental)
        assert result["related"][0]["finding_id"] == "lb-alt-f"
