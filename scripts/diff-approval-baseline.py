#!/usr/bin/env python3
"""
diff-approval-baseline.py -- F4 scientific-tier diff gate.

For one or more studies that have a captured baseline at
backend/tests/approval-baselines/{study}/baseline.json, rebuild the current
state from backend/generated/{study}/ via the same builder used by
capture-approval-baseline.py and produce a per-category diff.

Two-tier policy (per spec section 6.2):

  Scientific tier  --  ANY change requires a written rationale persisted to
                       .lattice/decisions.log via the approval-rationale
                       protocol. Rationale parser is a CONTRACT (Review-3),
                       not a heuristic: required fields, length minimums,
                       trivial-value rejection, duplicate-of-recent rejection.

  Presentation tier --  Auto-approve. Logged to .lattice/approval-log.tsv
                        for forensic audit.

Rationale source (when scientific-tier diffs are present):

  1. CLI flag        --rationale-file <path>     (test / scripted use)
  2. Env var         LATTICE_APPROVAL_RATIONALE  (single-shot inline JSON)
  3. Sticky file     .lattice/pending-approval-rationale.json
                     (pre-commit hook reads this)

If no rationale is available and the diff has scientific-tier changes,
this script exits 1 with a remediation message. Pre-commit Step 0e calls
diff-approval-baseline.py once per baseline; any non-zero exit blocks the
commit.

Usage:
  python scripts/diff-approval-baseline.py PointCross
  python scripts/diff-approval-baseline.py --all
  python scripts/diff-approval-baseline.py PointCross --rationale-file rationale.json
  python scripts/diff-approval-baseline.py PointCross --staleness-check

Exit:
  0  no diff, OR diff present and rationale accepted
  1  scientific-tier diff present and no acceptable rationale
  2  baseline / generated source missing or unreadable
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parent.parent
GENERATED_DIR = ROOT / "backend" / "generated"
BASELINE_DIR = ROOT / "backend" / "tests" / "approval-baselines"
APPROVAL_LOG = ROOT / ".lattice" / "approval-log.tsv"
PENDING_RATIONALE = ROOT / ".lattice" / "pending-approval-rationale.json"
DECISIONS_LOG = ROOT / ".lattice" / "decisions.log"


def _load_capture_module():
    """Import capture-approval-baseline.py for its build_baseline_dict()."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "capture_approval_baseline",
        ROOT / "scripts" / "capture-approval-baseline.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load capture-approval-baseline.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Categories of the scientific block. Order matters for the report.
SCIENTIFIC_CATEGORIES = (
    "summary_counts",
    "noael_per_endpoint_sex",
    "adverse_classification",
    "target_organs",
    "syndrome_detections",
    "signal_scores",
    "effect_sizes",
    "p_value_adjustments",
    "eci_dimensions",
)
PRESENTATION_CATEGORIES = ("labels", "format_strings", "bundle_artifacts")


@dataclass
class CategoryDiff:
    """Diff result for one category. Empty added/removed/changed = no diff."""
    category: str
    tier: str  # 'scientific' or 'presentation'
    added: list[tuple[str, Any]] = field(default_factory=list)
    removed: list[tuple[str, Any]] = field(default_factory=list)
    changed: list[tuple[str, Any, Any]] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not (self.added or self.removed or self.changed)

    def total(self) -> int:
        return len(self.added) + len(self.removed) + len(self.changed)


@dataclass
class StudyDiff:
    study_id: str
    scientific: list[CategoryDiff] = field(default_factory=list)
    presentation: list[CategoryDiff] = field(default_factory=list)

    def has_scientific_changes(self) -> bool:
        return any(not c.is_empty() for c in self.scientific)

    def has_presentation_changes(self) -> bool:
        return any(not c.is_empty() for c in self.presentation)


def _diff_dict(old: dict, new: dict) -> tuple[list, list, list]:
    """Generic dict diff: returns (added, removed, changed)."""
    added: list = []
    removed: list = []
    changed: list = []
    old_keys = set(old or {})
    new_keys = set(new or {})
    for k in sorted(new_keys - old_keys):
        added.append((k, new[k]))
    for k in sorted(old_keys - new_keys):
        removed.append((k, old[k]))
    for k in sorted(old_keys & new_keys):
        if old[k] != new[k]:
            changed.append((k, old[k], new[k]))
    return added, removed, changed


def _diff_list_by_id(old: list, new: list, id_key: str) -> tuple[list, list, list]:
    """Diff list-of-dicts by `id_key` (e.g. syndrome_detections by syndrome_id).

    Items missing the id_key are compared by their full json-serialized form.
    """
    def _index(items: list) -> dict[str, dict]:
        idx: dict[str, dict] = {}
        for i, item in enumerate(items or []):
            if isinstance(item, dict) and id_key in item:
                idx[str(item[id_key])] = item
            else:
                idx[f"_idx_{i}"] = item
        return idx

    return _diff_dict(_index(old), _index(new))


def _diff_target_organs(old: list, new: list) -> tuple[list, list, list]:
    """target_organs is a sorted list of strings; treat each string as both
    key and value so the report shows added/removed organ labels."""
    old_set = set(old or [])
    new_set = set(new or [])
    added = [(o, o) for o in sorted(new_set - old_set)]
    removed = [(o, o) for o in sorted(old_set - new_set)]
    return added, removed, []


def diff_baselines(old: dict, new: dict) -> StudyDiff:
    """Produce a per-category diff between two baseline dicts."""
    study_id = old.get("study_id") or new.get("study_id") or "?"
    sd = StudyDiff(study_id=study_id)

    old_sci = old.get("scientific") or {}
    new_sci = new.get("scientific") or {}
    for cat in SCIENTIFIC_CATEGORIES:
        cd = CategoryDiff(category=cat, tier="scientific")
        old_v = old_sci.get(cat)
        new_v = new_sci.get(cat)
        if cat == "target_organs":
            cd.added, cd.removed, cd.changed = _diff_target_organs(old_v or [], new_v or [])
        elif cat == "syndrome_detections":
            cd.added, cd.removed, cd.changed = _diff_list_by_id(old_v or [], new_v or [], "syndrome_id")
        else:
            cd.added, cd.removed, cd.changed = _diff_dict(old_v or {}, new_v or {})
        sd.scientific.append(cd)

    old_pres = old.get("presentation") or {}
    new_pres = new.get("presentation") or {}
    for cat in PRESENTATION_CATEGORIES:
        cd = CategoryDiff(category=cat, tier="presentation")
        old_v = old_pres.get(cat) or {}
        new_v = new_pres.get(cat) or {}
        cd.added, cd.removed, cd.changed = _diff_dict(old_v, new_v)
        sd.presentation.append(cd)

    return sd


# ---------------------------------------------------------------- rationale --

# Required structural fields for the rationale payload. Per Review-3, the
# parser is a CONTRACT (not a heuristic). Each field has a minimum length;
# rationale_text additionally rejects trivial values and duplicate-of-recent.
_REQUIRED_FIELDS: dict[str, int] = {
    "study": 1,            # Study id (matches baseline.study_id).
    "category": 1,         # Scientific category that changed (or "*" for any).
    "summary_old_new": 12, # Brief "old -> new" annotation, e.g. "BW M NOAEL 20 -> 80".
    "rationale_text": 40,  # The actual rationale paragraph.
}

# Trivial-value rejection. Compared case-insensitive after stripping whitespace.
_TRIVIAL_RATIONALE_VALUES = frozenset({
    "n/a", "na", "none", "idk", "tbd", "todo", "fix", "fixed",
    "same as before", "no change", "expected", "looks fine", "ok",
    "approved", "see commit", "see code",
})


@dataclass
class RationaleResult:
    accepted: bool
    payload: dict | None = None
    error: str | None = None


def _parse_rationale_payload(raw: str) -> dict | None:
    """Parse a rationale string. Accepts JSON or YAML-style key:value lines."""
    raw = raw.strip()
    if not raw:
        return None
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None
    out: dict = {}
    for line in raw.splitlines():
        line = line.rstrip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            return None
        key, _, value = line.partition(":")
        out[key.strip()] = value.strip()
    return out or None


def _recent_rationale_hashes(n: int = 5) -> set[str]:
    """SHA256 of the rationale_text in the last N accepted approval entries.

    Reads BOTH the presentation approval log and the scientific decisions log
    so the duplicate-of-recent rule applies across tiers (an author can't
    bypass dup detection by toggling between presentation and scientific
    diffs).

    Decisions-log row format (approval-test rows only):
      {ts}\\tapproval-test\\tACCEPTED\\t{study}/{category}\\tchanges:N source:S\\t{summary} -- {rationale_text}
    Approval-log row format:
      {ts}\\t{study}\\t{category}\\t{key}\\t{old}\\t{new}\\t{rationale_text}
    """
    import hashlib
    rationales: list[str] = []

    if APPROVAL_LOG.exists():
        for row in reversed(APPROVAL_LOG.read_text(encoding="utf-8").splitlines()):
            if "\t" not in row:
                continue
            cols = row.split("\t")
            if len(cols) >= 7:
                rationales.append(cols[6].strip().lower())
            if len(rationales) >= n:
                break

    if len(rationales) < n and DECISIONS_LOG.exists():
        for row in reversed(DECISIONS_LOG.read_text(encoding="utf-8").splitlines()):
            cols = row.split("\t")
            if len(cols) < 6 or cols[1] != "approval-test":
                continue
            # Detail column: "{summary} -- {rationale_text}". The split is right-most so
            # rationale_text containing " -- " stays intact in the summary side.
            detail = cols[5]
            _, sep, rationale_text = detail.partition(" -- ")
            if not sep:
                continue
            rationales.append(rationale_text.strip().lower())
            if len(rationales) >= n:
                break

    return {hashlib.sha256(r.encode("utf-8")).hexdigest() for r in rationales}


def validate_rationale(payload: dict | None, study_id: str) -> RationaleResult:
    """Apply the F4 rationale contract. Returns RationaleResult with details."""
    if payload is None:
        return RationaleResult(False, error="rationale parse failed (not JSON, not key:value lines, or empty)")

    # Required fields + minimum length.
    for field_name, min_len in _REQUIRED_FIELDS.items():
        if field_name not in payload:
            return RationaleResult(False, error=f"missing required field: {field_name!r} (min length {min_len})")
        v = payload[field_name]
        if not isinstance(v, str):
            return RationaleResult(False, error=f"{field_name!r} must be a string, got {type(v).__name__}")
        if len(v.strip()) < min_len:
            return RationaleResult(False, error=f"{field_name!r} too short: {len(v.strip())} < {min_len} characters")

    # study must match.
    if payload["study"].strip() != study_id:
        return RationaleResult(False, error=f"study mismatch: rationale.study={payload['study']!r}, expected {study_id!r}")

    # Trivial-value rejection on rationale_text.
    rt = payload["rationale_text"].strip().lower()
    if rt in _TRIVIAL_RATIONALE_VALUES:
        return RationaleResult(False, error=f"rationale_text is a trivial value: {rt!r}")

    # Single-word rejection (>=2 distinct word tokens required after the
    # minimum-length check, which alone permits "lorem ipsum dolor" style text;
    # this catches "approvedapprovedapproved" and similar).
    word_tokens = [w for w in rt.split() if any(c.isalpha() for c in w)]
    if len(set(word_tokens)) < 4:
        return RationaleResult(False, error=f"rationale_text needs >= 4 distinct alphabetic word tokens; got {len(set(word_tokens))}")

    # Duplicate-of-recent rejection (Review-3 final clause).
    import hashlib
    rt_hash = hashlib.sha256(rt.encode("utf-8")).hexdigest()
    if rt_hash in _recent_rationale_hashes(n=5):
        return RationaleResult(False, error="rationale_text is identical to one of the last 5 rationales; write a new one")

    return RationaleResult(True, payload=payload)


def load_rationale(args: argparse.Namespace) -> tuple[dict | None, str | None]:
    """Source the rationale from CLI flag, env var, or sticky file. Returns
    (payload, source_label). source_label = None means no rationale found."""
    if args.rationale_file:
        path = Path(args.rationale_file)
        if not path.exists():
            return None, f"--rationale-file {path} does not exist"
        return _parse_rationale_payload(path.read_text(encoding="utf-8")), f"file:{path}"

    inline = os.environ.get("LATTICE_APPROVAL_RATIONALE")
    if inline:
        return _parse_rationale_payload(inline), "env:LATTICE_APPROVAL_RATIONALE"

    if PENDING_RATIONALE.exists():
        return _parse_rationale_payload(PENDING_RATIONALE.read_text(encoding="utf-8")), f"file:{PENDING_RATIONALE.relative_to(ROOT)}"

    return None, None


# --------------------------------------------------------------- reporting --

def render_diff_report(sd: StudyDiff, *, max_per_category: int = 20) -> str:
    parts: list[str] = []
    parts.append(f"# Approval-test diff: {sd.study_id}")
    parts.append("")
    parts.append("## Scientific tier (commit-blocking on any diff)")
    parts.append("")
    any_sci = False
    for cd in sd.scientific:
        if cd.is_empty():
            continue
        any_sci = True
        parts.append(f"### {cd.category}  ({cd.total()} change(s))")
        for k, v in cd.added[:max_per_category]:
            parts.append(f"  + {k}: {_short(v)}")
        if len(cd.added) > max_per_category:
            parts.append(f"  ... and {len(cd.added) - max_per_category} more added")
        for k, v in cd.removed[:max_per_category]:
            parts.append(f"  - {k}: {_short(v)}")
        if len(cd.removed) > max_per_category:
            parts.append(f"  ... and {len(cd.removed) - max_per_category} more removed")
        for entry in cd.changed[:max_per_category]:
            k, old, new = entry
            parts.append(f"  ~ {k}: {_short(old)} -> {_short(new)}")
        if len(cd.changed) > max_per_category:
            parts.append(f"  ... and {len(cd.changed) - max_per_category} more changed")
        parts.append("")
    if not any_sci:
        parts.append("  (no scientific-tier changes)")
        parts.append("")

    parts.append("## Presentation tier (auto-logged, never blocks)")
    parts.append("")
    any_pres = False
    for cd in sd.presentation:
        if cd.is_empty():
            continue
        any_pres = True
        parts.append(f"### {cd.category}  ({cd.total()} change(s))")
    if not any_pres:
        parts.append("  (no presentation-tier changes)")
        parts.append("")
    return "\n".join(parts)


def _short(v: Any, limit: int = 80) -> str:
    s = json.dumps(v, default=str)
    if len(s) > limit:
        return s[:limit - 3] + "..."
    return s


# ----------------------------------------------------------- log writers ----

def append_presentation_log(sd: StudyDiff) -> None:
    """Write one TSV row per presentation-tier change to .lattice/approval-log.tsv."""
    if not sd.has_presentation_changes():
        return
    APPROVAL_LOG.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with APPROVAL_LOG.open("a", encoding="utf-8") as fh:
        for cd in sd.presentation:
            for k, v in cd.added:
                fh.write(f"{timestamp}\t{sd.study_id}\t{cd.category}\t{k}\t<absent>\t{_short(v, 200)}\tpresentation-auto-approved\n")
            for k, v in cd.removed:
                fh.write(f"{timestamp}\t{sd.study_id}\t{cd.category}\t{k}\t{_short(v, 200)}\t<absent>\tpresentation-auto-approved\n")
            for k, old, new in cd.changed:
                fh.write(f"{timestamp}\t{sd.study_id}\t{cd.category}\t{k}\t{_short(old, 200)}\t{_short(new, 200)}\tpresentation-auto-approved\n")


def append_decisions_log(sd: StudyDiff, rationale: dict, source_label: str) -> None:
    """Append one row per scientific-tier change to .lattice/decisions.log.

    Per spec section 6.2: every accepted rationale on a scientific-tier diff
    must persist for forensic audit. The diff caller MUST pass the validated
    rationale; this helper does no further validation.
    """
    DECISIONS_LOG.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    rt_short = rationale.get("rationale_text", "")[:240].replace("\t", " ").replace("\n", " ")
    summary = rationale.get("summary_old_new", "").replace("\t", " ").replace("\n", " ")
    with DECISIONS_LOG.open("a", encoding="utf-8") as fh:
        for cd in sd.scientific:
            if cd.is_empty():
                continue
            fh.write(
                f"{timestamp}\tapproval-test\tACCEPTED\t{sd.study_id}/{cd.category}\t"
                f"changes:{cd.total()} source:{source_label}\t{summary} -- {rt_short}\n"
            )


# --------------------------------------------------------------- staleness --

def staleness_warning(study_id: str, generated_dir: Path) -> str | None:
    """If unified_findings.json is older than any staged algorithmic file,
    return a warning string. Pre-commit Step 0e calls this to advise regen."""
    unified = generated_dir / "unified_findings.json"
    if not unified.exists():
        return f"missing {unified}"
    unified_mtime = unified.stat().st_mtime
    # Algorithmic file regex (mirrors hooks/pre-commit Step 0c default).
    import subprocess
    import re
    try:
        out = subprocess.check_output(
            ["git", "diff", "--cached", "--name-only"],
            cwd=str(ROOT), text=True, stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None
    pattern = re.compile(
        r"derive-summaries\.ts|endpoint-confidence\.ts|findings-rail-engine\.ts|"
        r"cross-domain-syndromes\.ts|syndrome-rules\.ts|backend/services/analysis/.*\.py"
    )
    stale_files: list[str] = []
    for line in out.splitlines():
        if not pattern.search(line):
            continue
        full = ROOT / line
        if full.exists() and full.stat().st_mtime > unified_mtime:
            stale_files.append(line)
    if stale_files:
        return (
            f"backend/generated/{study_id}/unified_findings.json is older than "
            f"{len(stale_files)} staged algorithmic file(s): {stale_files[:3]}"
            f"{' ...' if len(stale_files) > 3 else ''}\n  Re-run the generator before "
            f"the diff is meaningful."
        )
    return None


# ------------------------------------------------------------ orchestration --

def run_diff_for_study(study_id: str, args: argparse.Namespace) -> int:
    baseline_path = BASELINE_DIR / study_id / "baseline.json"
    if not baseline_path.exists():
        print(f"WARN: no baseline at {baseline_path}; nothing to diff", file=sys.stderr)
        return 0

    generated_dir = GENERATED_DIR / study_id
    if not generated_dir.exists():
        print(f"ERROR: generated directory missing for {study_id} at {generated_dir}", file=sys.stderr)
        return 2

    if args.staleness_check:
        warn = staleness_warning(study_id, generated_dir)
        if warn:
            print(f"WARN [staleness]: {warn}", file=sys.stderr)

    capture_mod = _load_capture_module()
    old = json.loads(baseline_path.read_text(encoding="utf-8"))
    new = capture_mod.build_baseline_dict(study_id, generated_dir)

    sd = diff_baselines(old, new)

    print(render_diff_report(sd))

    # Presentation-tier diffs auto-log unconditionally.
    if sd.has_presentation_changes():
        append_presentation_log(sd)
        print(f"  (presentation-tier changes appended to {APPROVAL_LOG.relative_to(ROOT)})")

    if not sd.has_scientific_changes():
        return 0

    # Scientific-tier diffs require a validated rationale.
    payload, source = load_rationale(args)
    if payload is None:
        if source:
            # Source was named (file/env) but parse failed.
            print(f"\nERROR: rationale source {source!r} was provided but could not be parsed", file=sys.stderr)
        else:
            print(
                f"\nCOMMIT BLOCKED: scientific-tier diff for {study_id} requires a written rationale.\n\n"
                f"Provide rationale via ONE of:\n"
                f"  --rationale-file <path-to-rationale.json>\n"
                f"  LATTICE_APPROVAL_RATIONALE='{{\"study\":\"{study_id}\",...}}' env var\n"
                f"  Write {PENDING_RATIONALE.relative_to(ROOT)} (sticky; pre-commit reads it)\n\n"
                f"Required fields (per F4 rationale contract):\n"
                f"  study              study id (must match baseline.study_id)\n"
                f"  category           scientific category that changed (or \"*\" for any)\n"
                f"  summary_old_new    >=12 char brief, e.g. \"BW NOAEL 20 -> 80 mg/kg both sexes\"\n"
                f"  rationale_text     >=40 char prose explanation, >=4 distinct word tokens,\n"
                f"                     not trivial (n/a / idk / etc.) and not identical to any\n"
                f"                     of the last 5 rationales in the approval log",
                file=sys.stderr,
            )
        return 1

    result = validate_rationale(payload, study_id)
    if not result.accepted:
        print(f"\nCOMMIT BLOCKED: rationale rejected -- {result.error}", file=sys.stderr)
        print(f"  source: {source}", file=sys.stderr)
        return 1

    append_decisions_log(sd, result.payload or payload, source or "<unknown>")
    print(f"\nOK: scientific-tier diff accepted for {study_id} (source: {source})")
    print(f"     persisted to {DECISIONS_LOG.relative_to(ROOT)}")

    # Pending file is single-shot: consume it so the next commit needs a new rationale.
    if source and source.startswith("file:") and PENDING_RATIONALE.exists():
        try:
            PENDING_RATIONALE.unlink()
            print(f"     consumed {PENDING_RATIONALE.relative_to(ROOT)}")
        except OSError:
            pass
    return 0


def iter_studies(args: argparse.Namespace) -> Iterator[str]:
    if args.all:
        for child in BASELINE_DIR.iterdir():
            if child.is_dir() and child.name != "_example" and (child / "baseline.json").exists():
                yield child.name
    else:
        yield args.study_id


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Diff a study's current generated output against its captured F4 baseline.",
    )
    parser.add_argument("study_id", nargs="?", help="Study to diff (omit with --all).")
    parser.add_argument("--all", action="store_true", help="Diff every study with a baseline (excluding _example).")
    parser.add_argument("--rationale-file", help="JSON or key:value rationale source.")
    parser.add_argument("--staleness-check", action="store_true",
                        help="Warn if unified_findings.json is older than staged algorithmic files.")
    args = parser.parse_args(argv)

    if not args.study_id and not args.all:
        parser.error("provide a study_id or --all")

    final_exit = 0
    for sid in iter_studies(args):
        rc = run_diff_for_study(sid, args)
        if rc > final_exit:
            final_exit = rc
    return final_exit


if __name__ == "__main__":
    sys.exit(main())
