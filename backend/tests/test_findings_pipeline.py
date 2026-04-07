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
# _with_defaults seeds ALL recognition keys (R1 F10 + Phase B/C)
# ──────────────────────────────────────────────────────────────

class TestWithDefaultsSeedsRecognitionKeys:
    def test_all_recognition_keys_present_after_defaults(self):
        """R1 F10 + Phase B/C: _with_defaults must seed all seven recognition
        keys so that if _enrich_finding raises mid-call, downstream consumers
        still see them. Phase B/C added canonical_base_finding,
        canonical_qualifier, test_code_recognition_source."""
        f = _with_defaults({})
        for key in (
            "test_code_recognition_level",
            "test_code_recognition_reason",
            "organ_recognition_level",
            "organ_norm_tier",
            "canonical_base_finding",
            "canonical_qualifier",
            "test_code_recognition_source",
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

    def test_mi_hypertrophy_level_3_base_concept(self):
        """Phase C: HEPATOCELLULAR HYPERTROPHY decomposes into HYPERTROPHY +
        HEPATOCELLULAR. Pre-Phase-C this finding was level 6 no_dictionary;
        the dispatcher now resolves it via extract_base_concept and emits the
        normalized comma-suffix canonical form for cross-study key stability.
        Note: _base() builds with test_name=test_code, so the dispatcher
        receives 'HEPATOCELLULAR HYPERTROPHY' as the finding term."""
        f = _with_defaults(_base("MI", "HEPATOCELLULAR HYPERTROPHY",
                                  specimen="LIVER", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "HYPERTROPHY, HEPATOCELLULAR"
        assert f["test_code_recognition_level"] == 3
        assert f["test_code_recognition_reason"] == "base_concept"
        assert f["canonical_base_finding"] == "HYPERTROPHY"
        assert f["canonical_qualifier"] == "HEPATOCELLULAR"

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

    def test_mi_hypertrophy_uppercase_normalized(self):
        """Phase C: MI findings dispatcher normalizes lowercase input,
        decomposes via base-concept extraction, and emits the canonical
        comma-suffix form for cross-study key stability."""
        f = _with_defaults(_base("MI", "hepatocellular hypertrophy",
                                  specimen="LIVER", data_type="incidence"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "HYPERTROPHY, HEPATOCELLULAR"
        assert f["test_code_recognition_level"] == 3

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


# ──────────────────────────────────────────────────────────────
# GAP-244: None-safety for severity_grade_counts iteration
# ──────────────────────────────────────────────────────────────

def _mi_incidence_with_groups(sgc_by_dose: list) -> dict:
    """Build a minimal MI-incidence finding with the given
    severity_grade_counts values per treated dose group (dose levels 1..N)."""
    f = _with_defaults(_base("MI", "HYPERPLASIA",
                              specimen="BONE MARROW, FEMUR",
                              data_type="incidence"))
    group_stats = [{"dose_level": 0, "severity_grade_counts": None}]  # control
    for i, sgc in enumerate(sgc_by_dose, start=1):
        group_stats.append({"dose_level": i, "severity_grade_counts": sgc})
    f["group_stats"] = group_stats
    return f


class TestSeverityGradeNoneSafety:
    """GAP-244: findings_pipeline.py:268-270 must not crash when
    severity_grade_counts is present-but-None (dict.get default only
    triggers on missing key). Fix recovers 463 findings across 12 studies
    that previously silently carried _enrichment_error."""

    def test_severity_grade_counts_none(self):
        """AC1.1 / AC1.3: all treated groups have None -> no crash,
        severity_grade_5pt stays None (no grading data available)."""
        f = _mi_incidence_with_groups([None, None, None])
        f = _enrich_finding(f)
        assert "_enrichment_error" not in f
        assert f["severity_grade_5pt"] is None

    def test_severity_grade_counts_empty_dict(self):
        """Empty-dict preservation: all treated groups have {} -> no crash,
        severity_grade_5pt stays None."""
        f = _mi_incidence_with_groups([{}, {}, {}])
        f = _enrich_finding(f)
        assert "_enrichment_error" not in f
        assert f["severity_grade_5pt"] is None

    def test_severity_grade_counts_populated(self):
        """AC1.2 science preservation: populated grading produces the correct
        max grade. This path was already working; the test anchors behavior."""
        f = _mi_incidence_with_groups([{"2": 3, "3": 1}])
        f = _enrich_finding(f)
        assert "_enrichment_error" not in f
        assert f["severity_grade_5pt"] == 3

    def test_severity_grade_counts_mixed_across_dose_groups(self):
        """AC1.4: production regression (73/86 PointCross errored findings).
        Pre-fix: the outer loop crashes on the first None and
        severity_grade_5pt stays at the _with_defaults seed of None.
        Post-fix: the loop continues past None groups and computes the
        correct max grade from the populated group."""
        f = _mi_incidence_with_groups([None, None, {"2": 1}])
        f = _enrich_finding(f)
        assert "_enrichment_error" not in f
        assert f["severity_grade_5pt"] == 2

# ──────────────────────────────────────────────────────────────
# Phase B/C wiring (etransafe-send-snomed-integration cycle)
# ──────────────────────────────────────────────────────────────


class TestPhaseCWiring:
    """Phase B/C dispatcher integration. assess_finding_recognition is wired
    into _enrich_finding for MI/MA/CL findings; LB/BW/etc. unchanged."""

    def test_mi_retinal_fold_alias_resolves_to_canonical(self):
        """AC-4.1a / AC-3.2 + GAP-248: a MI finding with test_name
        'RETINAL FOLD(S)' resolves to canonical 'RETINAL FOLD' at level 2."""
        f = _with_defaults(_base("MI", "EYE_RETINAL FOLD(S)",
                                  specimen="EYE", data_type="incidence"))
        f["test_name"] = "RETINAL FOLD(S)"
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "RETINAL FOLD"
        assert f["test_code_recognition_level"] == 2
        assert f["test_code_recognition_reason"] == "alias"
        # source telemetry is the provenance list
        assert f["test_code_recognition_source"] is not None
        assert isinstance(f["test_code_recognition_source"], list)

    def test_mi_hepatocellular_hypertrophy_level_3(self):
        """AC-4.2 / AC-3.3: HEPATOCELLULAR HYPERTROPHY decomposes to level 3
        with normalized comma-suffix canonical form."""
        f = _with_defaults(_base("MI", "LIVER_HEPATOCELLULAR HYPERTROPHY",
                                  specimen="LIVER", data_type="incidence"))
        f["test_name"] = "HEPATOCELLULAR HYPERTROPHY"
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "HYPERTROPHY, HEPATOCELLULAR"
        assert f["test_code_recognition_level"] == 3
        assert f["test_code_recognition_reason"] == "base_concept"
        assert f["canonical_base_finding"] == "HYPERTROPHY"
        assert f["canonical_qualifier"] == "HEPATOCELLULAR"
        assert f["test_code_recognition_source"] is not None

    def test_lb_unchanged_phase_a_path(self):
        """AC-4.3: LB findings still go through assess_test_code_recognition.
        New test_code_recognition_source field is null for LB."""
        f = _with_defaults(_base("LB", "ALT", specimen="SERUM"))
        f = _enrich_finding(f)
        assert f["canonical_testcd"] == "ALT"
        assert f["test_code_recognition_level"] == 1
        assert f["test_code_recognition_reason"] == "exact"
        assert f["test_code_recognition_source"] is None
        assert f["canonical_base_finding"] is None
        assert f["canonical_qualifier"] is None

    def test_bw_unchanged_phase_a_path(self):
        f = _with_defaults(_base("BW", "TERMBW"))
        f = _enrich_finding(f)
        assert f["test_code_recognition_source"] is None
        assert f["canonical_base_finding"] is None
        assert f["canonical_qualifier"] is None


class TestComplexityBudgetGate:
    """AC-4.5 gate test: reads the complexity baseline fixture and asserts
    the post-cycle _enrich_finding CC/LOC deltas are within budget.
    Budget: CC ≤ baseline + 2, logical LOC ≤ baseline + 20.
    """

    def _measure_enrich_finding(self) -> tuple[int, int]:
        """Compute current cyclomatic complexity + logical LOC of
        _enrich_finding by walking the AST of findings_pipeline.py."""
        import ast
        from pathlib import Path
        path = Path(__file__).resolve().parent.parent / "services" / "analysis" / "findings_pipeline.py"
        src = path.read_text(encoding="utf-8")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "_enrich_finding":
                cc = 1
                for child in ast.walk(node):
                    if isinstance(
                        child,
                        (ast.If, ast.For, ast.While, ast.Try, ast.ExceptHandler, ast.With, ast.Assert),
                    ):
                        cc += 1
                    elif isinstance(child, ast.BoolOp):
                        cc += len(child.values) - 1
                    elif isinstance(child, ast.IfExp):
                        cc += 1
                lines = src.split("\n")
                body_lines = lines[node.lineno - 1: node.end_lineno]
                loc = 0
                for ln in body_lines:
                    s = ln.strip()
                    if s and not s.startswith("#"):
                        loc += 1
                return cc, loc
        raise RuntimeError("_enrich_finding not found")

    def test_ac_4_5_gate_enforced(self):
        """AC-4.5: post-Feature-4 cyclomatic complexity ≤ baseline + 2 AND
        logical LOC ≤ baseline + 20 (both deltas relative to the captured
        pre-Feature-4 baseline fixture)."""
        import json
        from pathlib import Path
        baseline_path = (
            Path(__file__).resolve().parent
            / "fixtures" / "findings_pipeline_complexity_baseline.json"
        )
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        base_cc = baseline["_enrich_finding_cc"]
        base_loc = baseline["_enrich_finding_logical_loc"]
        cur_cc, cur_loc = self._measure_enrich_finding()
        assert cur_cc <= base_cc + 2, (
            f"AC-4.5 CC gate violated: current={cur_cc}, baseline={base_cc}, "
            f"delta={cur_cc - base_cc} > 2"
        )
        assert cur_loc <= base_loc + 20, (
            f"AC-4.5 LOC gate violated: current={cur_loc}, baseline={base_loc}, "
            f"delta={cur_loc - base_loc} > 20"
        )


class TestRecognitionBaselineGate:
    """AC-4.1-gate + AC-4.1-sanity + AC-5.8: reads the post-Feature-4 baseline
    fixture and asserts that the current generated unrecognized_terms.json for
    each study meets the baseline within the allowed drift window.
    """

    DRIFT_TOLERANCE = 0.02  # AC-4.1-gate: allow 2% reproducibility drift

    def _load_current_report(self, study_id: str) -> dict | None:
        import json
        from pathlib import Path
        p = (
            Path(__file__).resolve().parent.parent.parent
            / "backend" / "generated" / study_id / "unrecognized_terms.json"
        )
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding="utf-8"))

    def test_ac_4_1_gate_enforced(self):
        """AC-4.1-gate: current MI/MA/CL rates >= fixture - 0.02 drift tolerance.
        Skipped for any study whose unrecognized_terms.json is not on disk
        (fresh checkout scenario)."""
        import json
        from pathlib import Path
        baseline_path = (
            Path(__file__).resolve().parent
            / "fixtures" / "recognition_baseline_post_feature_4.json"
        )
        if not baseline_path.exists():
            pytest.skip("post-Feature-4 baseline not yet captured")
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        violations = []
        for study_id, baseline_rates in baseline["studies"].items():
            current = self._load_current_report(study_id)
            if current is None:
                continue  # fresh checkout — no generated data
            cur_by_domain = current.get("by_domain", {})
            for domain in ("MI", "MA", "CL"):
                base_rate = baseline_rates.get(f"{domain}_rate")
                if base_rate is None:
                    continue  # no findings in that domain
                cur_rate = cur_by_domain.get(domain, {}).get("rate")
                if cur_rate is None:
                    violations.append(
                        f"  {study_id} {domain}: base={base_rate} current=None"
                    )
                    continue
                if cur_rate < base_rate - self.DRIFT_TOLERANCE:
                    violations.append(
                        f"  {study_id} {domain}: base={base_rate} current={cur_rate} "
                        f"drift={base_rate - cur_rate:.4f} > {self.DRIFT_TOLERANCE}"
                    )
        assert not violations, (
            "AC-4.1-gate violations (drift > 2%):\n" + "\n".join(violations)
        )

    def test_ac_4_1_sanity_every_mi_study_has_positive_rate(self):
        """AC-4.1-sanity: every study with MI findings has a post-Phase-C
        recognition rate strictly greater than 0. Catches the 'dictionary
        loader silently fails' regression."""
        import json
        from pathlib import Path
        gen_dir = (
            Path(__file__).resolve().parent.parent.parent
            / "backend" / "generated"
        )
        if not gen_dir.exists():
            pytest.skip("no generated studies on disk")
        violations = []
        checked = 0
        for study_path in sorted(gen_dir.iterdir()):
            p = study_path / "unrecognized_terms.json"
            if not p.exists():
                continue
            report = json.loads(p.read_text(encoding="utf-8"))
            mi = report.get("by_domain", {}).get("MI", {})
            total = mi.get("total", 0)
            rate = mi.get("rate")
            if total > 0:
                checked += 1
                if rate is None or rate == 0.0:
                    violations.append(
                        f"  {study_path.name}: MI total={total} rate={rate}"
                    )
        if checked == 0:
            pytest.skip("no studies with MI findings on disk")
        assert not violations, (
            f"AC-4.1-sanity + AC-5.8: studies with MI findings must have rate > 0. "
            f"Phase C dispatcher may have silently failed.\n"
            + "\n".join(violations)
        )


class TestContractAllRecognitionFields:
    """AC-6.6: every enriched finding has all six recognition fields present
    (value may be None), and when populated the level value is in the
    documented BFIELD-134 enum."""

    BFIELD_134_ENUM = {1, 2, 3, 6}

    @pytest.mark.parametrize("domain,test_code,test_name,specimen", [
        ("LB", "ALT", "ALT", "SERUM"),
        ("LB", "XYZZY", "XYZZY", ""),
        ("MI", "LIVER_HYPERTROPHY", "HYPERTROPHY", "LIVER"),
        ("MI", "EYE_RETINAL FOLD(S)", "RETINAL FOLD(S)", "EYE"),
        ("MI", "LIVER_HEPATOCELLULAR HYPERTROPHY",
         "HEPATOCELLULAR HYPERTROPHY", "LIVER"),
        ("MA", "SPLEEN_DISCOLORATION", "DISCOLORATION", "SPLEEN"),
        ("CL", "ALOPECIA", "ALOPECIA", ""),
        ("OM", "WEIGHT", "WEIGHT", "LIVER"),
    ])
    def test_all_six_fields_present_and_enum_valid(
        self, domain, test_code, test_name, specimen
    ):
        f = _with_defaults(_base(domain, test_code, specimen=specimen,
                                  data_type="incidence" if domain in ("MI","MA","CL") else "continuous"))
        f["test_name"] = test_name
        f = _enrich_finding(f)
        for key in (
            "canonical_testcd",
            "test_code_recognition_level",
            "test_code_recognition_reason",
            "canonical_base_finding",
            "canonical_qualifier",
            "test_code_recognition_source",
        ):
            assert key in f, f"missing {key}"
        lvl = f["test_code_recognition_level"]
        if lvl is not None:
            assert lvl in self.BFIELD_134_ENUM, (
                f"level {lvl} not in {self.BFIELD_134_ENUM}"
            )


    # Note: R1 F5 proposed an additional end-to-end test for a None entry
    # inside the group_stats list itself. That test was dropped after
    # implementation discovered that `classify_dose_response()` in
    # classification.py:357 (a domain-critical module per
    # code-quality-guardrails.md) iterates group_stats earlier in the same
    # enrichment path without None-safety and would crash before the
    # severity-grade block is reached. Extending the fix into a
    # domain-critical file is scope creep per rule 15. R1 reviewer verified
    # empirically that no live data has None entries in group_stats, so the
    # defensive skip at findings_pipeline.py:268 is pure hardening kept for
    # symmetry with the line 270 fix. The latent classification.py:357
    # vulnerability is recorded as a GAP-245 addendum.
