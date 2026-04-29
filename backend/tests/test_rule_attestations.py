"""Unit tests for scripts/check-rule-attestations.py.

Tests the predicate evaluator (when + require) directly with synthetic
StagedFile lists -- bypasses git so each case is fully isolated. End-to-end
hook integration is exercised by the smoke-test fixtures committed alongside
this file (see scripts/test-rule-attestations.sh).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT / "scripts" / "check-rule-attestations.py"


def _load_module():
    """Load the hyphen-named script as a Python module."""
    spec = importlib.util.spec_from_file_location("check_rule_attestations",
                                                  SCRIPT_PATH)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["check_rule_attestations"] = mod
    spec.loader.exec_module(mod)
    return mod


cra = _load_module()


# ---------------------------------------------------------------- glob_match

@pytest.mark.parametrize("path,patterns,expected", [
    # Top-level file under lib/ matches the `*.ts` glob (single segment).
    ("frontend/src/lib/foo.ts", ["frontend/src/lib/*.ts"], True),
    # Nested file does NOT match `*.ts` (single * does not cross /).
    ("frontend/src/lib/sub/foo.ts", ["frontend/src/lib/*.ts"], False),
    # Nested file matches `**/*.ts` (** crosses /).
    ("frontend/src/lib/sub/foo.ts", ["frontend/src/lib/**/*.ts"], True),
    # `**` is zero-or-more dirs: top-level under `analysis/` matches the **-form.
    ("backend/services/analysis/scoring.py",
     ["backend/services/analysis/**/*.py"], True),
    # Subdir file also matches the **-form.
    ("backend/services/analysis/sub/scoring.py",
     ["backend/services/analysis/**/*.py"], True),
    # Direct `*.py` form: matches top-level only.
    ("backend/services/analysis/scoring.py",
     ["backend/services/analysis/*.py"], True),
    ("backend/services/analysis/sub/scoring.py",
     ["backend/services/analysis/*.py"], False),
    # Out-of-scope file does not match.
    ("frontend/src/components/Foo.tsx", ["frontend/src/lib/*.ts"], False),
    ("frontend/src/index.css", ["frontend/src/index.css"], True),
    ("a", [], False),
])
def test_glob_match(path, patterns, expected):
    assert cra.glob_match(path, patterns) is expected


# ---------------------------------------------------------------- fires_when: always

def test_fires_when_always():
    fired, _ = cra.fires_when({"kind": "always"}, [])
    assert fired is True


# ---------------------------------------------------------------- fires_when: path-glob

def test_fires_when_path_glob_hit():
    staged = [cra.StagedFile(path="frontend/src/lib/foo.ts", status="M")]
    fired, detail = cra.fires_when(
        {"kind": "path-glob", "paths": ["frontend/src/lib/*.ts"]}, staged)
    assert fired is True
    assert "frontend/src/lib/foo.ts" in detail


def test_fires_when_path_glob_miss():
    staged = [cra.StagedFile(path="frontend/src/components/Foo.tsx", status="M")]
    fired, _ = cra.fires_when(
        {"kind": "path-glob", "paths": ["frontend/src/lib/*.ts"]}, staged)
    assert fired is False


# ---------------------------------------------------------------- fires_when: new-file

def test_fires_when_new_file_status_filter():
    """new-file fires only on status=A (added), not M (modified)."""
    modified = [cra.StagedFile(path="docs/_internal/incoming/spec.md", status="M")]
    added = [cra.StagedFile(path="docs/_internal/incoming/spec.md", status="A")]
    pred = {"kind": "new-file", "paths": ["docs/_internal/incoming/*.md"]}
    assert cra.fires_when(pred, modified)[0] is False
    assert cra.fires_when(pred, added)[0] is True


def test_fires_when_new_file_exclude():
    pred = {"kind": "new-file",
            "paths": ["docs/_internal/incoming/*.md"],
            "exclude": ["docs/_internal/incoming/archive/*.md"]}
    archived = [cra.StagedFile(path="docs/_internal/incoming/archive/old.md",
                               status="A")]
    new = [cra.StagedFile(path="docs/_internal/incoming/new.md", status="A")]
    assert cra.fires_when(pred, archived)[0] is False
    assert cra.fires_when(pred, new)[0] is True


# ---------------------------------------------------------------- fires_when: new-dir-prefix

def test_fires_when_new_dir_prefix_root_allow():
    """File in an existing top-level dir does not fire."""
    pred = {"kind": "new-dir-prefix",
            "locations": [{"parent": "", "allow": ["frontend", "backend"]}]}
    staged = [cra.StagedFile(path="frontend/src/foo.ts", status="A")]
    fired, _ = cra.fires_when(pred, staged)
    assert fired is False


def test_fires_when_new_dir_prefix_root_block():
    """File creating a new top-level dir DOES fire."""
    pred = {"kind": "new-dir-prefix",
            "locations": [{"parent": "", "allow": ["frontend", "backend"]}]}
    staged = [cra.StagedFile(path="newdir/foo.ts", status="A")]
    fired, detail = cra.fires_when(pred, staged)
    assert fired is True
    assert "newdir/" in detail


def test_fires_when_new_dir_prefix_root_only_files():
    """A new top-level FILE (not dir) does not fire — rule 8 is dir-scoped."""
    pred = {"kind": "new-dir-prefix",
            "locations": [{"parent": "", "allow": ["frontend", "backend"]}]}
    staged = [cra.StagedFile(path="ROOT_README.md", status="A")]
    fired, _ = cra.fires_when(pred, staged)
    assert fired is False


def test_fires_when_new_dir_prefix_modified_doesnt_fire():
    pred = {"kind": "new-dir-prefix",
            "locations": [{"parent": "", "allow": ["frontend"]}]}
    staged = [cra.StagedFile(path="frontend/foo.ts", status="M")]
    fired, _ = cra.fires_when(pred, staged)
    assert fired is False


def test_fires_when_new_dir_prefix_nested_parent():
    pred = {"kind": "new-dir-prefix",
            "locations": [{"parent": "docs", "allow": ["_internal"]}]}
    new_subdir = [cra.StagedFile(path="docs/public/foo.md", status="A")]
    existing_subdir = [cra.StagedFile(path="docs/_internal/foo.md", status="A")]
    fired, detail = cra.fires_when(pred, new_subdir)
    assert fired is True
    assert "docs/public/" in detail
    fired, _ = cra.fires_when(pred, existing_subdir)
    assert fired is False


def test_fires_when_new_dir_prefix_dedupe():
    """Multiple files in the same new dir produce one violation entry."""
    pred = {"kind": "new-dir-prefix",
            "locations": [{"parent": "", "allow": ["frontend"]}]}
    staged = [
        cra.StagedFile(path="newdir/a.ts", status="A"),
        cra.StagedFile(path="newdir/b.ts", status="A"),
    ]
    fired, detail = cra.fires_when(pred, staged)
    assert fired is True
    assert detail.count("newdir/") == 1


# ---------------------------------------------------------------- fires_when: path-archive-move

def test_fires_when_archive_move_fires():
    pred = {"kind": "path-archive-move",
            "from": "docs/_internal/incoming",
            "to": "docs/_internal/incoming/archive"}
    staged = [cra.StagedFile(
        path="docs/_internal/incoming/archive/spec.md",
        status="R",
        rename_from="docs/_internal/incoming/spec.md",
    )]
    fired, detail = cra.fires_when(pred, staged)
    assert fired is True
    assert "spec.md" in detail


def test_fires_when_archive_move_unrelated_rename():
    pred = {"kind": "path-archive-move",
            "from": "docs/_internal/incoming",
            "to": "docs/_internal/incoming/archive"}
    staged = [cra.StagedFile(
        path="frontend/src/Bar.tsx",
        status="R",
        rename_from="frontend/src/Foo.tsx",
    )]
    fired, _ = cra.fires_when(pred, staged)
    assert fired is False


# ---------------------------------------------------------------- trailer parsing

def test_parse_trailers_basic():
    msg = "fix: foo\n\nDetails about the fix.\n\nImpact-Analysis: reviewed\nCo-Authored-By: alice@x\n"
    out = cra.parse_trailers(msg)
    names = {n: v for (n, v) in out}
    assert names["Impact-Analysis"] == "reviewed"
    assert names["Co-Authored-By"] == "alice@x"


def test_parse_trailers_strips_git_comments():
    """Lines beginning with `#` are git comments — must not be parsed."""
    msg = ("fix: foo\n\n"
           "# This commit modifies the following files:\n"
           "# Impact-Analysis: not-really-a-trailer\n")
    out = cra.parse_trailers(msg)
    assert all(n != "Impact-Analysis" for (n, _) in out)


def test_parse_trailers_multiple_same_name():
    msg = "fix: foo\n\nCo-Authored-By: alice@x\nCo-Authored-By: bob@y\n"
    out = cra.parse_trailers(msg)
    names = [n for (n, _) in out]
    assert names.count("Co-Authored-By") == 2


# ---------------------------------------------------------------- eval_rule_pre_commit

def test_eval_pre_commit_block_fires():
    rule = {
        "id": "rule-8-test",
        "rule": 8,
        "summary": "no new top-level dirs",
        "when": {"kind": "new-dir-prefix",
                 "locations": [{"parent": "", "allow": ["frontend"]}]},
        "require": {"kind": "block", "hint": "do not"},
    }
    staged = [cra.StagedFile(path="newdir/x.ts", status="A")]
    v = cra.eval_rule_pre_commit(rule, staged)
    assert v is not None
    assert v.rule_id == "rule-8-test"
    assert "newdir/" in v.detail


def test_eval_pre_commit_block_silent_when_not_firing():
    rule = {
        "id": "rule-8-test",
        "rule": 8,
        "summary": "no new top-level dirs",
        "when": {"kind": "new-dir-prefix",
                 "locations": [{"parent": "", "allow": ["frontend"]}]},
        "require": {"kind": "block", "hint": "do not"},
    }
    staged = [cra.StagedFile(path="frontend/foo.ts", status="A")]
    assert cra.eval_rule_pre_commit(rule, staged) is None


def test_eval_pre_commit_any_touch_satisfied():
    """When `when` fires AND `paths` are touched, no violation."""
    rule = {
        "id": "rule-6-test",
        "rule": 6,
        "summary": "spec archive must extract knowledge",
        "when": {"kind": "path-archive-move",
                 "from": "incoming", "to": "incoming/archive"},
        "require": {"kind": "any-touch",
                    "paths": ["knowledge/**/*.md", "TODO.md"],
                    "hint": "extract"},
    }
    staged = [
        cra.StagedFile(path="incoming/archive/spec.md", status="R",
                       rename_from="incoming/spec.md"),
        cra.StagedFile(path="knowledge/learnings.md", status="M"),
    ]
    assert cra.eval_rule_pre_commit(rule, staged) is None


def test_eval_pre_commit_any_touch_unsatisfied():
    rule = {
        "id": "rule-6-test",
        "rule": 6,
        "summary": "spec archive must extract knowledge",
        "when": {"kind": "path-archive-move",
                 "from": "incoming", "to": "incoming/archive"},
        "require": {"kind": "any-touch",
                    "paths": ["knowledge/**/*.md", "TODO.md"],
                    "hint": "extract"},
    }
    staged = [cra.StagedFile(path="incoming/archive/spec.md", status="R",
                             rename_from="incoming/spec.md")]
    v = cra.eval_rule_pre_commit(rule, staged)
    assert v is not None
    assert v.rule_id == "rule-6-test"


def test_eval_pre_commit_ignores_trailer_rules():
    """A rule with require=trailer is commit-msg phase; pre-commit must skip."""
    rule = {
        "id": "rule-15-test",
        "rule": 15,
        "summary": "shared code",
        "when": {"kind": "path-glob", "paths": ["frontend/src/lib/*.ts"]},
        "require": {"kind": "trailer", "name": "Impact-Analysis",
                    "pattern": ".+", "hint": ""},
    }
    staged = [cra.StagedFile(path="frontend/src/lib/foo.ts", status="M")]
    assert cra.eval_rule_pre_commit(rule, staged) is None


# ---------------------------------------------------------------- eval_rule_commit_msg

def test_eval_commit_msg_trailer_required_present():
    rule = {
        "id": "rule-15-test",
        "rule": 15,
        "summary": "shared code",
        "when": {"kind": "path-glob", "paths": ["frontend/src/lib/*.ts"]},
        "require": {"kind": "trailer", "name": "Impact-Analysis",
                    "pattern": "^(reviewed|skip:.+)$", "hint": ""},
    }
    staged = [cra.StagedFile(path="frontend/src/lib/foo.ts", status="M")]
    msg = "refactor: foo\n\nImpact-Analysis: reviewed\n"
    assert cra.eval_rule_commit_msg(rule, staged, msg) is None


def test_eval_commit_msg_trailer_required_missing():
    rule = {
        "id": "rule-15-test",
        "rule": 15,
        "summary": "shared code",
        "when": {"kind": "path-glob", "paths": ["frontend/src/lib/*.ts"]},
        "require": {"kind": "trailer", "name": "Impact-Analysis",
                    "pattern": "^(reviewed|skip:.+)$", "hint": "add it"},
    }
    staged = [cra.StagedFile(path="frontend/src/lib/foo.ts", status="M")]
    msg = "refactor: foo\n\nNo trailer here.\n"
    v = cra.eval_rule_commit_msg(rule, staged, msg)
    assert v is not None


def test_eval_commit_msg_trailer_value_pattern_mismatch():
    """Trailer present but value doesn't match pattern -> violation."""
    rule = {
        "id": "rule-15-test",
        "rule": 15,
        "summary": "shared code",
        "when": {"kind": "path-glob", "paths": ["frontend/src/lib/*.ts"]},
        "require": {"kind": "trailer", "name": "Impact-Analysis",
                    "pattern": "^(reviewed|skip:.+)$", "hint": ""},
    }
    staged = [cra.StagedFile(path="frontend/src/lib/foo.ts", status="M")]
    msg = "refactor: foo\n\nImpact-Analysis: bogus-value\n"
    v = cra.eval_rule_commit_msg(rule, staged, msg)
    assert v is not None


def test_eval_commit_msg_trailer_silent_when_not_firing():
    """If `when` doesn't fire, the trailer requirement is a no-op."""
    rule = {
        "id": "rule-15-test",
        "rule": 15,
        "summary": "shared code",
        "when": {"kind": "path-glob", "paths": ["frontend/src/lib/*.ts"]},
        "require": {"kind": "trailer", "name": "Impact-Analysis",
                    "pattern": ".+", "hint": ""},
    }
    staged = [cra.StagedFile(path="docs/foo.md", status="M")]
    msg = "docs: foo\n"
    assert cra.eval_rule_commit_msg(rule, staged, msg) is None


def test_eval_commit_msg_trailer_forbidden_with_value_pattern():
    """Co-Authored-By is allowed unless value matches the forbid pattern."""
    rule = {
        "id": "rule-4-test",
        "rule": 4,
        "summary": "no claude coauthor",
        "when": {"kind": "always"},
        "require": {"kind": "trailer-forbidden", "name": "Co-Authored-By",
                    "value_pattern": "(?i)claude|anthropic", "hint": ""},
    }
    staged = []
    msg_ok = "fix: foo\n\nCo-Authored-By: alice@x\n"
    msg_bad = "fix: foo\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>\n"
    assert cra.eval_rule_commit_msg(rule, staged, msg_ok) is None
    v = cra.eval_rule_commit_msg(rule, staged, msg_bad)
    assert v is not None
    assert "Claude" in v.detail


def test_eval_commit_msg_trailer_forbidden_no_pattern():
    """When value_pattern is omitted, ANY trailer presence is forbidden."""
    rule = {
        "id": "no-trailer-x",
        "rule": 99,
        "summary": "no x trailer",
        "when": {"kind": "always"},
        "require": {"kind": "trailer-forbidden", "name": "X-Forbidden",
                    "hint": ""},
    }
    staged = []
    msg_ok = "fix: foo\n"
    msg_bad = "fix: foo\n\nX-Forbidden: any-value\n"
    assert cra.eval_rule_commit_msg(rule, staged, msg_ok) is None
    assert cra.eval_rule_commit_msg(rule, staged, msg_bad) is not None


def test_eval_commit_msg_ignores_pre_commit_rules():
    """A rule with require=block is pre-commit phase; commit-msg must skip."""
    rule = {
        "id": "rule-8-test",
        "rule": 8,
        "summary": "no top-level",
        "when": {"kind": "new-dir-prefix",
                 "locations": [{"parent": "", "allow": []}]},
        "require": {"kind": "block", "hint": ""},
    }
    staged = [cra.StagedFile(path="newdir/foo.ts", status="A")]
    assert cra.eval_rule_commit_msg(rule, staged, "fix: foo\n") is None
