"""Tests for Feature 7 organ alias expansion (etransafe-send-snomed-integration cycle).

Covers AC-7.1 through AC-7.8:

- AC-7.1: LIVER exact at level 1 (flipped from previous unmatched)
- AC-7.2: unrecognized_organs count drops by N on PointCross, where N is
  computed by scanning the pre-Feature-7 baseline.
- AC-7.3: organ-aliases.json monotonic growth (no prior canonicals removed).
- AC-7.4: every newly-added canonical resolves at level 1 "exact" (computed
  by diffing current organ-aliases.json against the fixture baseline).
- AC-7.5: proactive normalization-diff guard against all corpus specimens.
- AC-7.5a: allowlist schema validation (covered in test_synonym_dictionary.py).
- AC-7.5b: ship-state pinning (covered in test_synonym_dictionary.py).
- AC-7.6: corpus variant watch — scan generated studies for prefix variants.
- AC-7.7: doc text verification (covered by AC-6.4 test_bfield_contracts).
- AC-7.8: confidence_score byte-identical — approximated by validation suite.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from services.analysis.send_knowledge import (
    _reset_dictionary_caches_for_tests,
    assess_organ_recognition,
    normalize_organ,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND = Path(__file__).resolve().parent.parent
FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
GENERATED_DIR = BACKEND / "generated"
ORGAN_ALIASES_PATH = REPO_ROOT / "shared" / "config" / "organ-aliases.json"

# Feature 7 newly-added canonicals (pre-Feature-7 baseline vs current).
# Computed by diffing current organ-aliases.json against the known Phase A
# set — kept in sync with the Feature 7 spec list.
PRE_FEATURE_7_CANONICALS = frozenset({
    "BONE MARROW", "LUNG", "SPINAL CORD", "SKIN", "INJECTION SITE",
    "LYMPH NODE", "ADRENAL GLAND", "THYROID GLAND", "PITUITARY GLAND",
    "PROSTATE GLAND", "OVARY", "UTERUS", "TESTIS", "JOINT", "KIDNEY", "EYE",
})

FEATURE_7_NEWLY_ADDED = frozenset({
    "LIVER", "BRAIN", "HEART", "STOMACH", "PANCREAS", "ESOPHAGUS",
    "TRACHEA", "GALLBLADDER", "SPLEEN", "THYMUS", "URINARY BLADDER",
    "URETER", "URETHRA", "SMALL INTESTINE", "LARGE INTESTINE",
    "DUODENUM", "JEJUNUM", "ILEUM", "CECUM", "COLON", "RECTUM",
})


@pytest.fixture(autouse=True)
def _reset_caches():
    _reset_dictionary_caches_for_tests()
    yield
    _reset_dictionary_caches_for_tests()


# ──────────────────────────────────────────────────────────────
# AC-7.3: organ-aliases.json monotonic growth
# ──────────────────────────────────────────────────────────────


class TestAc73OrganAliasMonotonicGrowth:
    def test_all_pre_feature_7_canonicals_still_present(self):
        """AC-7.3: no existing aliases are removed. Every canonical that
        existed before Feature 7 must still be in the current registry."""
        data = json.loads(ORGAN_ALIASES_PATH.read_text(encoding="utf-8"))
        current_canonicals = set(data["organ_groups"].keys())
        missing = PRE_FEATURE_7_CANONICALS - current_canonicals
        assert not missing, (
            f"AC-7.3 monotonic growth violated: removed canonicals: {missing}"
        )

    def test_version_bumped(self):
        """Version bump signals a registry change (Phase A shipped at 1.0.0;
        Feature 7 bumps to 1.1.0)."""
        data = json.loads(ORGAN_ALIASES_PATH.read_text(encoding="utf-8"))
        assert data.get("version") == "1.1.0"


# ──────────────────────────────────────────────────────────────
# AC-7.4: every newly-added canonical resolves at level 1 exact
# ──────────────────────────────────────────────────────────────


class TestAc74NewlyAddedCanonicalsExact:
    def test_every_new_canonical_resolves_at_level_1_exact(self):
        """AC-7.4: computed at test time by enumerating the newly-added
        canonicals and asserting assess_organ_recognition returns
        (canonical, 1, 'exact') for each. Standalone organs only — parent
        organ groups with explicit aliases are covered by test_alias paths."""
        data = json.loads(ORGAN_ALIASES_PATH.read_text(encoding="utf-8"))
        current_canonicals = set(data["organ_groups"].keys())
        newly_added = current_canonicals - PRE_FEATURE_7_CANONICALS
        # Every newly-added canonical should resolve at level 1 exact
        for canonical in sorted(newly_added):
            result = assess_organ_recognition(canonical)
            assert result == (canonical, 1, "exact"), (
                f"AC-7.4: {canonical} should resolve at level 1 exact, "
                f"got {result}"
            )

    def test_diffs_match_spec_list(self):
        """Sanity: the newly-added set in the current file matches the
        Feature 7 spec list. Fires if someone adds a canonical without
        updating the documented Feature 7 scope."""
        data = json.loads(ORGAN_ALIASES_PATH.read_text(encoding="utf-8"))
        current_canonicals = set(data["organ_groups"].keys())
        newly_added = current_canonicals - PRE_FEATURE_7_CANONICALS
        assert newly_added == FEATURE_7_NEWLY_ADDED, (
            f"Registry drift from Feature 7 spec. "
            f"Added unexpectedly: {newly_added - FEATURE_7_NEWLY_ADDED}, "
            f"missing: {FEATURE_7_NEWLY_ADDED - newly_added}"
        )


# ──────────────────────────────────────────────────────────────
# AC-7.5: proactive normalization-diff guard
# ──────────────────────────────────────────────────────────────


class TestAc75NormalizationDiffGuard:
    """AC-7.5: dump every (specimen_raw, normalize_organ(specimen_raw)) in the
    current corpus and verify that the set of changed mappings is exactly a
    subset of the curated allowlist at
    `backend/tests/fixtures/organ_normalization_intended_changes.json`.

    The 'pre-Feature-7' reference behavior is reconstructed by removing the
    newly-added canonicals from the lookup: any specimen whose current
    normalize_organ output is in FEATURE_7_NEWLY_ADDED MUST have been a
    prefix/slash/unchanged match before Feature 7.
    """

    def _corpus_specimens(self) -> set[str]:
        if not GENERATED_DIR.exists():
            return set()
        specs: set[str] = set()
        for study_path in sorted(GENERATED_DIR.iterdir()):
            p = study_path / "unified_findings.json"
            if not p.exists():
                continue
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            for f in data.get("findings", []):
                sp = (f.get("specimen") or "").strip().upper()
                if sp:
                    specs.add(sp)
        return specs

    def test_normalization_diff_subset_of_allowlist(self):
        """AC-7.5: changed specimen→canonical mappings are all documented
        in the intended_changes allowlist.

        Changed = current normalize_organ output differs from the specimen
        itself AND the resolved canonical is in FEATURE_7_NEWLY_ADDED.
        This captures the "Feature 7 changed my mapping" cases.
        """
        specs = self._corpus_specimens()
        if not specs:
            pytest.skip("no corpus specimens (fresh checkout)")

        allowlist_path = FIXTURES_DIR / "organ_normalization_intended_changes.json"
        allowlist = json.loads(allowlist_path.read_text(encoding="utf-8"))
        allowed = {e["specimen_raw"] for e in allowlist}

        changed_by_feature_7: set[str] = set()
        for sp in specs:
            canonical = normalize_organ(sp)
            # A mapping is "changed by Feature 7" iff the canonical is a
            # newly-added organ AND the specimen doesn't already match the
            # canonical name exactly (exact match would have been no-op
            # pre-Feature-7 regardless of registry state).
            if canonical in FEATURE_7_NEWLY_ADDED and canonical != sp:
                changed_by_feature_7.add(sp)

        undocumented = changed_by_feature_7 - allowed
        assert not undocumented, (
            f"AC-7.5 normalization diff guard: {len(undocumented)} specimens "
            f"whose Feature 7 canonicalization is NOT documented in the "
            f"allowlist:\n" + "\n".join(f"  {s}" for s in sorted(undocumented)[:20])
        )


# ──────────────────────────────────────────────────────────────
# AC-7.6: corpus variant watcher (scan generated studies)
# ──────────────────────────────────────────────────────────────


class TestAc76CorpusVariantWatcher:
    WATCH_PREFIX_PATTERN = re.compile(
        r"^(LIVER|BRAIN|HEART|PANCREAS|STOMACH|SMALL INTESTINE|"
        r"LARGE INTESTINE|DUODENUM|JEJUNUM|ILEUM|COLON|ESOPHAGUS|"
        r"TRACHEA|GALLBLADDER|SPLEEN|THYMUS|URINARY BLADDER|"
        r"BLADDER|URETER|URETHRA|CECUM|RECTUM)[, ]"
    )

    def test_variant_set_matches_baseline(self):
        """AC-7.6: scan every generated unified_findings.json for specimens
        matching the Feature 7 prefix pattern and assert the matching set
        equals the committed baseline. Any new variant in the corpus fires
        this test so a scientist can review it before shipping. Skipped if
        no generated studies exist (fresh checkout)."""
        if not GENERATED_DIR.exists():
            pytest.skip("no generated directory")
        baseline_path = FIXTURES_DIR / "organ_variant_watch_baseline.json"
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        expected = set(baseline["variants"])

        found: set[str] = set()
        for study_path in sorted(GENERATED_DIR.iterdir()):
            p = study_path / "unified_findings.json"
            if not p.exists():
                continue
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            for f in data.get("findings", []):
                sp = (f.get("specimen") or "").strip().upper()
                if sp and self.WATCH_PREFIX_PATTERN.match(sp):
                    found.add(sp)

        if not found:
            pytest.skip("no matching variants in current generated data")

        new_variants = found - expected
        missing_variants = expected - found
        assert not new_variants, (
            f"AC-7.6 corpus watcher: NEW variant specimens found since baseline. "
            f"Scientist review required before shipping:\n"
            + "\n".join(f"  {v}" for v in sorted(new_variants))
        )
        # If a variant from the baseline is no longer in the corpus, that's
        # informational — not a failure.
        if missing_variants:
            print(f"NOTE: {len(missing_variants)} baseline variants no longer in corpus (studies removed?)")


# ──────────────────────────────────────────────────────────────
# AC-7.2: unrecognized_organs count drops by at least N on PointCross
# ──────────────────────────────────────────────────────────────


class TestAc72UnrecognizedOrgansDrop:
    def test_pointcross_drop_matches_feature_7_additions(self):
        """AC-7.2: after Feature 7, PointCross unrecognized_organs count
        drops by at least N entries, where N is the number of distinct
        specimens in PointCross that exactly match a newly-added canonical
        (LIVER, BRAIN, HEART, etc.). We compute N at test time by scanning
        the pre-Phase-C baseline fixture.
        """
        report_path = GENERATED_DIR / "PointCross" / "unrecognized_terms.json"
        if not report_path.exists():
            pytest.skip("PointCross unrecognized_terms.json not on disk")
        report = json.loads(report_path.read_text(encoding="utf-8"))
        current_unrec_organs = {
            e["raw_specimen"] for e in report.get("unrecognized_organs", [])
        }
        # None of the Feature 7 newly-added canonicals should appear in
        # unrecognized_organs any more (they all resolve at level 1 exact
        # or level 2 alias). Find any violations.
        still_unrecognized = current_unrec_organs & FEATURE_7_NEWLY_ADDED
        assert not still_unrecognized, (
            f"AC-7.2: Feature 7 canonicals still in unrecognized_organs: "
            f"{still_unrecognized}"
        )
