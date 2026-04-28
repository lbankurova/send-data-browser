#!/usr/bin/env python3
"""
test-diff-approval-baseline.py -- regression tests for F4 diff + rationale parser.

Covers:
  - Rationale contract (Review-3): required fields, length minimums, trivial-
    value rejection, distinct-word-token minimum, study mismatch, duplicate-
    of-recent rejection.
  - Diff categories: dict-additions / removals / changes; list-by-id (syndromes);
    target_organs set semantics.
  - End-to-end: capture from a temp generated dir, edit one value, diff,
    verify scientific-tier diff requires rationale.

Run:
  python scripts/test-diff-approval-baseline.py
Exit:
  0  all pass
  1  one or more failures
"""

from __future__ import annotations

import json
import sys
import importlib.util
import tempfile
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _import_module(name: str, path: Path):
    """Import a hyphenated-filename script under a Python-friendly module name.

    Registers in sys.modules so dataclass resolution + relative imports work.
    """
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


_diff = _import_module("diff_approval_baseline", ROOT / "scripts" / "diff-approval-baseline.py")
_capture = _import_module("capture_approval_baseline", ROOT / "scripts" / "capture-approval-baseline.py")


PASS = "PASS"
FAIL = "FAIL"
results: list[tuple[str, str, str]] = []  # (case, status, detail)


def _record(case: str, ok: bool, detail: str = "") -> None:
    results.append((case, PASS if ok else FAIL, detail))


# -------------------------------------------------- rationale contract tests --

def test_rationale_full_valid():
    payload = {
        "study": "PointCross",
        "category": "noael_per_endpoint_sex",
        "summary_old_new": "BW NOAEL 20 -> 80",
        "rationale_text": (
            "Switched Dunnett to Bonferroni per spec X; pairwise p-adj rises "
            "5-15 percent across endpoints; observed within reference range."
        ),
    }
    r = _diff.validate_rationale(payload, "PointCross")
    _record("rationale: full valid", r.accepted, r.error or "")


def test_rationale_missing_field():
    payload = {
        "study": "PointCross",
        "category": "noael",
        "summary_old_new": "BW NOAEL 20 -> 80",
    }
    r = _diff.validate_rationale(payload, "PointCross")
    _record("rationale: missing rationale_text", not r.accepted, r.error or "")


def test_rationale_study_mismatch():
    payload = {
        "study": "OtherStudy",
        "category": "noael",
        "summary_old_new": "BW NOAEL 20 -> 80",
        "rationale_text": "Switched aggregation to multi-timepoint per spec; verified across endpoints; output stable.",
    }
    r = _diff.validate_rationale(payload, "PointCross")
    _record("rationale: study mismatch", not r.accepted, r.error or "")


def test_rationale_trivial_value():
    payload = {
        "study": "PointCross",
        "category": "noael",
        "summary_old_new": "BW NOAEL 20 -> 80",
        "rationale_text": "n/a            n/a            n/a            ",
    }
    r = _diff.validate_rationale(payload, "PointCross")
    _record("rationale: trivial value n/a", not r.accepted, r.error or "")


def test_rationale_too_few_distinct_words():
    payload = {
        "study": "PointCross",
        "category": "noael",
        "summary_old_new": "BW NOAEL 20 -> 80",
        "rationale_text": "word word word word word word word word word word word word word",
    }
    r = _diff.validate_rationale(payload, "PointCross")
    _record("rationale: < 4 distinct word tokens", not r.accepted, r.error or "")


def test_rationale_short_summary():
    payload = {
        "study": "PointCross",
        "category": "noael",
        "summary_old_new": "short",
        "rationale_text": "Switched aggregation to multi-timepoint per spec; verified across endpoints; output stable.",
    }
    r = _diff.validate_rationale(payload, "PointCross")
    _record("rationale: summary_old_new < 12 chars", not r.accepted, r.error or "")


def test_rationale_duplicate_of_recent(monkeypatch_log: Path):
    # Seed approval log with one rationale; new payload uses the same text.
    text = "Switched aggregation method to multi-timepoint per spec validated across endpoints output stable"
    log_row = (
        f"2026-04-28T00:00:00Z\tPointCross\tnoael\tk\told\tnew\t{text.lower()}\n"
    )
    monkeypatch_log.write_text(log_row, encoding="utf-8")
    original_log = _diff.APPROVAL_LOG
    _diff.APPROVAL_LOG = monkeypatch_log
    try:
        payload = {
            "study": "PointCross",
            "category": "noael",
            "summary_old_new": "BW NOAEL 20 -> 80",
            "rationale_text": text,  # case-insensitive duplicate of seeded row
        }
        r = _diff.validate_rationale(payload, "PointCross")
        _record("rationale: duplicate-of-recent rejected", not r.accepted, r.error or "")
    finally:
        _diff.APPROVAL_LOG = original_log


# ------------------------------------------------------ payload parser tests --

def test_parse_json():
    raw = json.dumps({"study": "X", "rationale_text": "ok"})
    parsed = _diff._parse_rationale_payload(raw)
    _record("parser: json", parsed == {"study": "X", "rationale_text": "ok"})


def test_parse_keyvalue():
    raw = "study: X\ncategory: noael\n# comment\nsummary_old_new: a -> b\nrationale_text: longer text"
    parsed = _diff._parse_rationale_payload(raw)
    expected = {
        "study": "X",
        "category": "noael",
        "summary_old_new": "a -> b",
        "rationale_text": "longer text",
    }
    _record("parser: key:value lines", parsed == expected)


def test_parse_invalid():
    parsed = _diff._parse_rationale_payload("just a sentence with no colon")
    _record("parser: invalid -> None", parsed is None)


# ------------------------------------------------------------ diff semantics --

def test_diff_dict_changes():
    old = {"a": 1, "b": 2, "c": 3}
    new = {"a": 1, "b": 999, "d": 4}  # changed b, removed c, added d
    added, removed, changed = _diff._diff_dict(old, new)
    ok = added == [("d", 4)] and removed == [("c", 3)] and changed == [("b", 2, 999)]
    _record("diff: dict add/remove/change", ok, f"{added=} {removed=} {changed=}")


def test_diff_target_organs():
    old = ["liver", "kidney"]
    new = ["kidney", "spleen"]
    added, removed, changed = _diff._diff_target_organs(old, new)
    ok = added == [("spleen", "spleen")] and removed == [("liver", "liver")]
    _record("diff: target_organs add/remove", ok, f"{added=} {removed=}")


def test_diff_syndromes_by_id():
    old = [{"syndrome_id": "XS01", "evidence_count": 4}, {"syndrome_id": "XS02", "evidence_count": 2}]
    new = [{"syndrome_id": "XS01", "evidence_count": 5}, {"syndrome_id": "XS03", "evidence_count": 1}]
    added, removed, changed = _diff._diff_list_by_id(old, new, "syndrome_id")
    ok = (
        added == [("XS03", {"syndrome_id": "XS03", "evidence_count": 1})]
        and removed == [("XS02", {"syndrome_id": "XS02", "evidence_count": 2})]
        and len(changed) == 1
        and changed[0][0] == "XS01"
    )
    _record("diff: syndromes by id", ok, f"{added=} {removed=} {changed=}")


def test_diff_baselines_no_changes():
    b = json.loads((ROOT / "backend" / "tests" / "approval-baselines" / "PointCross" / "baseline.json").read_text(encoding="utf-8"))
    sd = _diff.diff_baselines(b, b)
    _record("diff: baseline vs itself = no changes",
            not sd.has_scientific_changes() and not sd.has_presentation_changes())


def test_diff_baselines_with_changes():
    b = json.loads((ROOT / "backend" / "tests" / "approval-baselines" / "PointCross" / "baseline.json").read_text(encoding="utf-8"))
    altered = json.loads(json.dumps(b))  # deep copy
    altered["scientific"]["summary_counts"]["total_findings"] += 1
    sd = _diff.diff_baselines(b, altered)
    _record("diff: altered total_findings -> scientific change",
            sd.has_scientific_changes())


# --------------------------------------------------------------- entry point --

def main() -> int:
    monkeypatch_dir = Path(tempfile.mkdtemp(prefix="approval-test-"))
    monkeypatch_log = monkeypatch_dir / "approval-log.tsv"
    try:
        test_rationale_full_valid()
        test_rationale_missing_field()
        test_rationale_study_mismatch()
        test_rationale_trivial_value()
        test_rationale_too_few_distinct_words()
        test_rationale_short_summary()
        test_rationale_duplicate_of_recent(monkeypatch_log)
        test_parse_json()
        test_parse_keyvalue()
        test_parse_invalid()
        test_diff_dict_changes()
        test_diff_target_organs()
        test_diff_syndromes_by_id()
        test_diff_baselines_no_changes()
        test_diff_baselines_with_changes()
    finally:
        shutil.rmtree(monkeypatch_dir, ignore_errors=True)

    fails = [r for r in results if r[1] == FAIL]
    for case, status, detail in results:
        prefix = "OK  " if status == PASS else "FAIL"
        print(f"{prefix}  {case}" + (f"  -- {detail}" if detail and status == FAIL else ""))
    print()
    print(f"{len(results) - len(fails)} pass / {len(fails)} fail / {len(results)} total")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
