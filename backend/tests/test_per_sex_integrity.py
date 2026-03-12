"""Per-sex data integrity, corroboration quality, and known-answer regression tests.

Loads pre-generated unified_findings.json for fast execution (no XPT parsing).
Verifies that per-sex splitting is correct, corroboration quality gate works,
and known-answer findings match verified raw XPT values.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import pytest

from services.analysis.corroboration import passes_corroboration_gate

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

GENERATED = Path(__file__).resolve().parent.parent / "generated" / "PointCross"


@pytest.fixture(scope="module")
def findings() -> list[dict]:
    with open(GENERATED / "unified_findings.json") as f:
        return json.load(f)["findings"]


# ──────────────────────────────────────────────────────────────
# Section A — Per-sex splitting (all domains)
# ──────────────────────────────────────────────────────────────

class TestPerSexSplitting:
    """Every multi-sex domain must have both F and M findings."""

    @pytest.mark.parametrize("domain", ["MI", "MA", "OM", "LB", "BW", "CL"])
    def test_both_sexes_present(self, findings: list[dict], domain: str):
        sexes = {f["sex"] for f in findings if f["domain"] == domain}
        assert "F" in sexes, f"{domain} missing female findings"
        assert "M" in sexes, f"{domain} missing male findings"

    def test_mi_denominators(self, findings: list[dict]):
        """MI group_stats N should sum to DM subject count per sex (40)."""
        mi = [f for f in findings if f["domain"] == "MI"]
        for f in mi:
            total_n = sum(g["n"] for g in f["group_stats"])
            assert total_n == 40, (
                f"MI {f.get('specimen')}/{f.get('finding')} sex={f['sex']} "
                f"has total N={total_n}, expected 40"
            )

    def test_om_denominators(self, findings: list[dict]):
        """OM group_stats N should not exceed DM subject count per sex (40)."""
        om = [f for f in findings if f["domain"] == "OM"]
        for f in om:
            total_n = sum(g["n"] for g in f["group_stats"])
            assert total_n <= 40, (
                f"OM {f.get('specimen')} sex={f['sex']} "
                f"has total N={total_n}, exceeds 40"
            )


# ──────────────────────────────────────────────────────────────
# Section B — Per-sex data divergence
# ──────────────────────────────────────────────────────────────

class TestPerSexDivergence:
    """Continuous domains should have divergent F/M values (catches pooling bugs)."""

    @pytest.mark.parametrize("domain", ["LB", "OM", "BW"])
    def test_continuous_not_all_identical(self, findings: list[dict], domain: str):
        """<50% of F/M pairs should have identical control-group means."""
        endpoint_means: dict[tuple, dict[str, float | None]] = defaultdict(dict)
        for f in findings:
            if f["domain"] != domain:
                continue
            key = (f.get("endpoint_label") or f.get("test_name"), f.get("day"))
            gs = f.get("group_stats", [])
            if gs:
                endpoint_means[key][f["sex"]] = gs[0].get("mean")

        total_pairs = 0
        identical = 0
        for _key, sexes in endpoint_means.items():
            if "F" in sexes and "M" in sexes:
                total_pairs += 1
                if sexes["F"] == sexes["M"]:
                    identical += 1

        assert total_pairs > 0, f"No F/M pairs found for {domain}"
        ratio = identical / total_pairs
        assert ratio < 0.50, (
            f"{domain}: {identical}/{total_pairs} ({ratio:.0%}) F/M pairs "
            f"have identical means — likely pooling bug"
        )

    def test_mi_identity_ratio_pinned(self, findings: list[dict]):
        """MI has high identity ratio (discrete incidence data). Pin it."""
        mi_by_key: dict[tuple, dict[str, list]] = defaultdict(dict)
        for f in findings:
            if f["domain"] != "MI":
                continue
            key = (f.get("specimen"), f.get("finding"))
            incidences = [g.get("incidence") for g in f.get("group_stats", [])]
            mi_by_key[key][f["sex"]] = incidences

        total_pairs = 0
        identical = 0
        for _key, sexes in mi_by_key.items():
            if "F" in sexes and "M" in sexes:
                total_pairs += 1
                if sexes["F"] == sexes["M"]:
                    identical += 1

        # Currently 41/45 identical. Range allows for minor pipeline changes.
        assert 38 <= identical <= 46, (
            f"MI identical F/M pairs = {identical}, expected 38–46"
        )


# ──────────────────────────────────────────────────────────────
# Section C — Known-answer regression
# ──────────────────────────────────────────────────────────────

class TestKnownAnswerRegression:
    """Verified against raw XPT data."""

    def test_heart_inflammation_per_sex(self, findings: list[dict]):
        """3F/3M affected at doses 2 & 3, 0 at control (raw XPT verified)."""
        heart_infl = [
            f for f in findings
            if (f.get("specimen") or "").upper().startswith("HEART")
            and f["domain"] == "MI"
            and (f.get("finding") or "").upper() == "INFLAMMATION"
        ]
        assert len(heart_infl) == 2, f"Expected 2 heart inflammation findings, got {len(heart_infl)}"

        for f in heart_infl:
            gs = {g["dose_level"]: g for g in f["group_stats"]}
            # Control: 0 affected
            assert gs[0]["affected"] == 0, f"sex={f['sex']} control should have 0 affected"
            # High doses: 3 affected each
            assert gs[2]["affected"] == 3, f"sex={f['sex']} dose 2 should have 3 affected"
            assert gs[3]["affected"] == 3, f"sex={f['sex']} dose 3 should have 3 affected"

    def test_heart_weight_opposite_directions(self, findings: list[dict]):
        """Heart weight: F=up, M=down for same endpoint."""
        heart_wt = [
            f for f in findings
            if (f.get("specimen") or f.get("test_name") or "").upper().startswith("HEART")
            and f["domain"] == "OM"
        ]
        assert len(heart_wt) == 2
        by_sex = {f["sex"]: f for f in heart_wt}
        assert by_sex["F"]["direction"] == "up"
        assert by_sex["M"]["direction"] == "down"

    def test_alt_adverse_treatment_related(self, findings: list[dict]):
        """ALT has adverse + treatment_related in at least one sex."""
        alt = [
            f for f in findings
            if f.get("test_code") == "ALT"
            and f.get("severity") == "adverse"
            and f.get("treatment_related") is True
        ]
        assert len(alt) >= 1, "No ALT findings with adverse + treatment_related"


# ──────────────────────────────────────────────────────────────
# Section D — Corroboration quality
# ──────────────────────────────────────────────────────────────

class TestCorroborationQuality:
    """Quality gate and known-answer corroboration status."""

    # -- Unit tests for the gate function --

    def test_gate_accepts_treatment_related(self):
        assert passes_corroboration_gate({"treatment_related": True}) is True

    def test_gate_rejects_non_treatment_related(self):
        assert passes_corroboration_gate({"treatment_related": False}) is False

    def test_gate_rejects_missing_field(self):
        assert passes_corroboration_gate({}) is False

    def test_gate_rejects_none(self):
        assert passes_corroboration_gate({"treatment_related": None}) is False

    # -- Integration tests on generated data --

    def test_heart_weight_f_not_corroborated(self, findings: list[dict]):
        """Heart weight (F) should NOT be corroborated.

        Its only cross-domain MI support (heart inflammation) has
        treatment_related=False, so it fails the quality gate.
        """
        heart_wt_f = [
            f for f in findings
            if (f.get("specimen") or f.get("test_name") or "").upper().startswith("HEART")
            and f["domain"] == "OM"
            and f["sex"] == "F"
        ]
        assert len(heart_wt_f) == 1
        assert heart_wt_f[0]["corroboration_status"] == "uncorroborated"

    def test_heart_weight_m_still_corroborated(self, findings: list[dict]):
        """Heart weight (M) is partially corroborated.

        XS09 (Target organ wasting) matches BW decrease + OM decrease, but the
        MI supporting finding (mammary atrophy, direction=up) contradicts the
        syndrome's expected direction (down). SLA-16 direction coherence gate
        downgrades this to partially_corroborated.
        """
        heart_wt_m = [
            f for f in findings
            if (f.get("specimen") or f.get("test_name") or "").upper().startswith("HEART")
            and f["domain"] == "OM"
            and f["sex"] == "M"
        ]
        assert len(heart_wt_m) == 1
        assert heart_wt_m[0]["corroboration_status"] == "partially_corroborated"

    def test_alt_f_corroborated(self, findings: list[dict]):
        """ALT (F) corroborated by liver hypertrophy (both tr=True, XS01)."""
        alt_f = [
            f for f in findings
            if f.get("test_code") == "ALT"
            and f["sex"] == "F"
            and f.get("treatment_related") is True
        ]
        assert len(alt_f) == 1
        assert alt_f[0]["corroboration_status"] == "corroborated"

    def test_all_findings_have_corroboration_status(self, findings: list[dict]):
        """Every finding must have a valid corroboration_status."""
        valid = {
            "corroborated", "partially_corroborated",
            "uncorroborated", "not_applicable",
        }
        for f in findings:
            status = f.get("corroboration_status")
            assert status in valid, (
                f"Finding {f.get('domain')}/{f.get('test_code') or f.get('finding')} "
                f"sex={f.get('sex')} has invalid corroboration_status={status!r}"
            )

    def test_corroborated_count(self, findings: list[dict]):
        """Total corroborated + partially corroborated findings should be ~76.

        SLA-05 fix: incidence domain adversity classification changed from
        B-factor Cohen's d gates to statistical+pattern-based gates.
        SLA-16 fix: direction coherence gate splits some corroborated into
        partially_corroborated (61 full + 15 partial = 76 total).
        """
        full = sum(1 for f in findings if f["corroboration_status"] == "corroborated")
        partial = sum(1 for f in findings if f["corroboration_status"] == "partially_corroborated")
        total = full + partial
        assert 73 <= total <= 79, (
            f"Corroborated count = {full} full + {partial} partial = {total}, expected 73–79"
        )

    def test_edge_case_tr_true_severity_normal(self, findings: list[dict]):
        """treatment_related=True + severity=normal should not exist.

        Under current classification rules, all paths to treatment_related=True
        require statistical significance that yields at least severity="warning".
        If future changes create this combination, this test fails to force review
        of whether such findings should pass the corroboration gate.
        """
        violations = [
            f for f in findings
            if f.get("treatment_related") is True
            and f.get("severity") == "normal"
        ]
        assert len(violations) == 0, (
            f"{len(violations)} findings have treatment_related=True + "
            f"severity=normal — review corroboration gate criteria"
        )
