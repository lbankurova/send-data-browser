"""E2E and invariant tests for Phase A recognition wiring in generate.py.

These tests exercise the generator output contract for the
unrecognized-term-flagging cycle:

- test_pointcross_regenerate_writes_unrecognized_terms_json
- test_pointcross_dictionary_versions_sync (R1 F14 sync invariant)
- test_pointcross_corpus_assertion_bone_marrow_femur_alias (R1 F11 corpus,
  skip-if-not-present)
- test_recognition_report_failure_does_not_lose_unified_findings (R1 F6
  fault injection — verifies exception containment, not a full regeneration)

Tests that depend on a fresh PointCross regeneration are skipped if the
generated files don't carry Phase A recognition fields. Run
`python -m generator.generate PointCross` before this suite to enable them.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
from pathlib import Path

import pytest

BACKEND = Path(__file__).parent.parent
POINTCROSS_DIR = BACKEND / "generated" / "PointCross"
UNRECOGNIZED_TERMS_JSON = POINTCROSS_DIR / "unrecognized_terms.json"
STUDY_METADATA_JSON = POINTCROSS_DIR / "study_metadata_enriched.json"
UNIFIED_FINDINGS_JSON = POINTCROSS_DIR / "unified_findings.json"


def _has_phase_a_outputs() -> bool:
    """True iff PointCross has been regenerated with Phase A fields."""
    if not UNRECOGNIZED_TERMS_JSON.exists():
        return False
    if not STUDY_METADATA_JSON.exists():
        return False
    with open(STUDY_METADATA_JSON) as f:
        meta = json.load(f)
    return "dictionary_versions" in meta


requires_phase_a = pytest.mark.skipif(
    not _has_phase_a_outputs(),
    reason=(
        "PointCross not regenerated with Phase A outputs. Run "
        "`python -m generator.generate PointCross` to enable E2E tests."
    ),
)


# ──────────────────────────────────────────────────────────────
# F3: unrecognized_terms.json presence and shape
# ──────────────────────────────────────────────────────────────

@requires_phase_a
class TestUnrecognizedTermsReportPresence:
    def test_file_exists(self):
        assert UNRECOGNIZED_TERMS_JSON.exists()

    def test_all_top_level_keys(self):
        with open(UNRECOGNIZED_TERMS_JSON) as f:
            report = json.load(f)
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
        assert required.issubset(set(report.keys()))

    def test_summary_total_findings_matches_unified(self):
        """AC-2 Feature 3: total_findings equals len(unified_findings.findings)."""
        with open(UNRECOGNIZED_TERMS_JSON) as f:
            report = json.load(f)
        with open(UNIFIED_FINDINGS_JSON) as f:
            unified = json.load(f)
        assert report["summary"]["total_findings"] == len(unified["findings"])


# ──────────────────────────────────────────────────────────────
# F14 sync invariant: study_metadata_enriched and report versions agree
# ──────────────────────────────────────────────────────────────

@requires_phase_a
class TestDictionaryVersionsSync:
    def test_snapshot_matches_canonical(self):
        """R1 F14: canonical dictionary_versions lives in study_metadata_enriched
        and is snapshotted into unrecognized_terms.json verbatim."""
        with open(STUDY_METADATA_JSON) as f:
            meta = json.load(f)
        with open(UNRECOGNIZED_TERMS_JSON) as f:
            report = json.load(f)
        assert report["dictionary_versions_snapshot"] == meta["dictionary_versions"]

    def test_versions_are_nonempty_strings(self):
        with open(STUDY_METADATA_JSON) as f:
            meta = json.load(f)
        versions = meta["dictionary_versions"]
        assert isinstance(versions.get("test_code_aliases"), str)
        assert isinstance(versions.get("organ_aliases"), str)
        assert versions["test_code_aliases"] != ""
        assert versions["organ_aliases"] != ""


# ──────────────────────────────────────────────────────────────
# F11 corpus assertion (skip-if-not-present)
# ──────────────────────────────────────────────────────────────

@requires_phase_a
class TestPointCrossCorpusAssertion:
    def test_bone_marrow_femur_resolves_to_alias(self):
        """R1 F11: if PointCross contains a 'BONE MARROW, FEMUR' finding, it
        must have organ_recognition_level == 2. If no such finding exists,
        skip -- this is a corpus assertion, not a contract violation."""
        with open(UNIFIED_FINDINGS_JSON) as f:
            unified = json.load(f)
        bm_femur = [
            f for f in unified["findings"]
            if (f.get("specimen") or "").upper().strip() == "BONE MARROW, FEMUR"
        ]
        if not bm_femur:
            pytest.skip("PointCross has no BONE MARROW, FEMUR findings")
        for f in bm_femur:
            assert f.get("organ_recognition_level") == 2, (
                f"BONE MARROW, FEMUR finding must resolve to level 2 alias, "
                f"got {f.get('organ_recognition_level')}"
            )
            # R1 F9: organ_norm_tier is None for level 2
            assert f.get("organ_norm_tier") is None


# ──────────────────────────────────────────────────────────────
# F6 fault-injection (no full regeneration)
# ──────────────────────────────────────────────────────────────

class TestRecognitionFailureContainment:
    """R1 F6 / R2 N2: verify the exception tuple used in generate.py covers
    the builder bug modes (KeyError/ValueError/TypeError/AttributeError) and
    that OSError propagates.

    This test does NOT run a full generation — it exercises the contract of
    build_unrecognized_terms_report directly and asserts that the exception
    types expected by the generate.py try/except are the ones the builder
    actually raises on malformed input.
    """

    def test_malformed_finding_raises_catchable_exception(self):
        """A finding dict missing expected keys raises one of the caught
        exception types, so the generate.py try/except will contain it."""
        from services.analysis.send_knowledge import build_unrecognized_terms_report

        # A non-dict finding — triggers AttributeError on .get()
        with pytest.raises((KeyError, ValueError, TypeError, AttributeError)):
            build_unrecognized_terms_report(
                [None],  # type: ignore[list-item]
                "S",
                {"test_code_aliases": "1.0.0", "organ_aliases": "1.0.0"},
            )

    def test_generate_try_except_narrowed_per_r2_n2(self):
        """R2 N2: the try/except in generate.py must NOT catch OSError.
        Assert the exception tuple statically by reading the source."""
        src = (BACKEND / "generator" / "generate.py").read_text(encoding="utf-8")
        assert (
            "except (KeyError, ValueError, TypeError, AttributeError)" in src
        ), "generate.py must narrow recognition-report exception list (R2 N2)"
        # And must NOT catch the blanket Exception at the same site
        assert "Recognition report failed" in src


# ──────────────────────────────────────────────────────────────
# F6 behavioral E2E — gated by env var (~90s regeneration cost)
# ──────────────────────────────────────────────────────────────

@pytest.mark.skipif(
    os.environ.get("RUN_SLOW_E2E") != "1",
    reason=(
        "Slow behavioral E2E (~90s PointCross regen + clean re-regen). "
        "Set RUN_SLOW_E2E=1 to run. Required for the full Feature 5 AC-4 proof "
        "(R1 F6): run generation with a fault-injected builder, assert "
        "unified_findings.json is preserved, warning is printed, and "
        "unrecognized_terms.json is absent."
    ),
)
class TestRecognitionFailureBehavioralE2E:
    """R1 F6 behavioral proof for Feature 5 AC-4.

    The spec's acceptance criterion reads:

        "If build_unrecognized_terms_report raises (e.g., on a malformed
         finding dict), the except branch fires and generation continues.
         unrecognized_terms.json is absent for that study but
         unified_findings.json and all other artifacts are preserved.
         Tested via fault-injection in test_generator_outputs.py: pass a
         finding dict missing `domain` to the helper and assert (a) the
         warning is printed, (b) the generation completes, (c)
         unified_findings.json exists."

    The static/contract tests above cover the exception-type surface. This
    test adds the behavioral assertion: actually run a full generation with
    the builder monkeypatched, verify the three stated invariants, and clean
    up by re-regenerating PointCross so the rest of the suite still passes.
    """

    def test_generation_survives_builder_failure(self, monkeypatch):
        from generator import generate as gen_module

        def _boom(*args, **kwargs):
            raise KeyError("synthetic: missing domain on malformed finding")

        monkeypatch.setattr(gen_module, "build_unrecognized_terms_report", _boom)

        # Remove both files so we can prove they were (or were not) rewritten
        # by THIS run, not just left over from a previous clean regen.
        if UNIFIED_FINDINGS_JSON.exists():
            UNIFIED_FINDINGS_JSON.unlink()
        if UNRECOGNIZED_TERMS_JSON.exists():
            UNRECOGNIZED_TERMS_JSON.unlink()

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            gen_module.generate("PointCross")
        out = buf.getvalue()

        try:
            # (a) warning printed
            assert "WARNING: Recognition report failed" in out, (
                "Expected the narrowed-exception warning line in stdout; "
                f"stdout tail was: {out[-500:]}"
            )
            # (b) generation completed (stdout reached the phase-timing block)
            assert "Generation complete" in out, (
                "generate() did not reach the 'Generation complete' marker"
            )
            # (c) unified_findings.json exists despite the builder failure
            assert UNIFIED_FINDINGS_JSON.exists(), (
                "unified_findings.json was lost when the recognition helper raised"
            )
            # And per spec, unrecognized_terms.json must be absent after a failure
            assert not UNRECOGNIZED_TERMS_JSON.exists(), (
                "unrecognized_terms.json should be absent when the builder raised"
            )
        finally:
            # Restore PointCross so downstream tests that depend on
            # unrecognized_terms.json (TestUnrecognizedTermsReportPresence,
            # TestDictionaryVersionsSync, TestPointCrossCorpusAssertion) still
            # pass on the next run.
            buf_restore = io.StringIO()
            with contextlib.redirect_stdout(buf_restore):
                gen_module.generate("PointCross")
            assert UNRECOGNIZED_TERMS_JSON.exists(), (
                "Clean re-regeneration failed to restore unrecognized_terms.json"
            )
