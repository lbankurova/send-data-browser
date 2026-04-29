#!/usr/bin/env python3
"""
check-rule-attestations.py -- mechanical CLAUDE.md rule dispatcher.

Reads `<repo-root>/.lattice/rule-attestations.yaml` and evaluates each rule's
`when` predicate against the staged diff. Rules whose `when` fires must
satisfy a `require` predicate or the script exits non-zero with a hint.

Path B of the mechanical-rules consolidation. Replaces N hand-written
pre-commit Steps (one per rule) with a single dispatcher + YAML config:
new rules become new YAML rows, not new bash blocks. See
.continue-here-mechanical-checks-buildout.md for the design rationale.

Phase routing:
  pre-commit phase  -> resolves require kinds {any-touch, block}
  commit-msg phase  -> resolves require kinds {trailer, trailer-forbidden}

Usage:
  # invoked by .githooks/pre-commit Step 0h
  python scripts/check-rule-attestations.py --phase pre-commit

  # invoked by .githooks/commit-msg
  python scripts/check-rule-attestations.py --phase commit-msg \\
      --message-file "$1"

Env knobs:
  LATTICE_RULE_ATTESTATIONS_SKIP=rule-15,rule-1   # skip listed rule ids
  LATTICE_RULE_ATTESTATIONS_ADVISORY=1            # print but exit 0

Exit codes:
  0 -- all rules pass (or skipped)
  1 -- one or more rules failed (commit blocked)
  2 -- configuration error (missing yaml, malformed YAML, etc.)
"""

from __future__ import annotations

import argparse
import functools
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:
    print(
        "check-rule-attestations: pyyaml not installed.\n"
        "  Install: pip install pyyaml (system python)\n"
        "  Or: C:/pg/pcc/backend/venv/Scripts/pip.exe install pyyaml",
        file=sys.stderr,
    )
    sys.exit(2)

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / ".lattice" / "rule-attestations.yaml"


# ---------------------------------------------------------------- types

@dataclass(frozen=True)
class StagedFile:
    path: str           # repo-relative
    status: str         # 'A' | 'M' | 'D' | 'R'
    rename_from: str | None = None  # for status 'R': the pre-rename path


@dataclass
class Violation:
    rule_id: str
    rule_num: int
    summary: str
    detail: str         # the staged paths or trailer that triggered
    hint: str


# ---------------------------------------------------------------- staged-diff

def get_staged() -> list[StagedFile]:
    """Read `git diff --cached --name-status -z`. Tolerates renames (R<score>)."""
    proc = subprocess.run(
        ["git", "diff", "--cached", "--name-status", "-z"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    out: list[StagedFile] = []
    parts = proc.stdout.split("\0")
    i = 0
    while i < len(parts):
        token = parts[i]
        if not token:
            i += 1
            continue
        status = token[0]
        if status == "R":  # rename: status, oldpath, newpath
            old = parts[i + 1] if i + 1 < len(parts) else ""
            new = parts[i + 2] if i + 2 < len(parts) else ""
            out.append(StagedFile(path=new, status="R", rename_from=old))
            i += 3
        else:
            path = parts[i + 1] if i + 1 < len(parts) else ""
            out.append(StagedFile(path=path, status=status))
            i += 2
    return out


# ---------------------------------------------------------------- predicates

@functools.lru_cache(maxsize=None)
def _glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Translate a glob to an anchored regex. Semantics:
        **    matches zero or more path segments (directories)
        *     matches any chars EXCEPT /
        ?     matches a single char EXCEPT /
        Other regex metacharacters are escaped.
    Standard rsync/zsh extended-glob semantics; matches what most tooling
    (vitest globs, gitignore, .npmignore, pathlib 3.13+) expects.

    Notably `a/**/b` matches `a/b` (zero dirs) AND `a/x/b` (one) AND `a/x/y/b`
    (two). Without the surrounding slash treatment, `a/**/b` would not match
    `a/b`, which surprises users.
    """
    out: list[str] = []
    i = 0
    while i < len(pattern):
        # /**/  -> (?:/.*/|/)  (zero or more dirs, both slashes consumed)
        if pattern[i:i + 4] == "/**/":
            out.append("(?:/.*/|/)")
            i += 4
            continue
        # **/   (at start)  -> (?:.*/)?  (optional dir prefix)
        if pattern[i:i + 3] == "**/":
            out.append("(?:.*/)?")
            i += 3
            continue
        # /**   (at end)    -> (?:/.*)?  (optional anything-after)
        if pattern[i:i + 3] == "/**" and i + 3 == len(pattern):
            out.append("(?:/.*)?")
            i += 3
            continue
        # bare ** (e.g. inside a more complex pattern)
        if pattern[i:i + 2] == "**":
            out.append(".*")
            i += 2
            continue
        c = pattern[i]
        if c == "*":
            out.append("[^/]*")
            i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        elif c in r".+()|^$\{}[]":
            out.append("\\" + c)
            i += 1
        else:
            out.append(c)
            i += 1
    return re.compile("^" + "".join(out) + "$")


def glob_match(path: str, patterns: list[str]) -> bool:
    """Match `path` against any of the glob `patterns`. Repo-relative paths."""
    for pat in patterns:
        if _glob_to_regex(pat).match(path):
            return True
    return False


def fires_when(when: dict, staged: list[StagedFile]) -> tuple[bool, str]:
    """Evaluate `when` predicate. Returns (fired, detail-string-for-hint)."""
    kind = when.get("kind")
    if kind == "always":
        return True, ""
    if kind == "path-glob":
        patterns = when.get("paths", [])
        hits = [s.path for s in staged if glob_match(s.path, patterns)]
        return bool(hits), ", ".join(hits)
    if kind == "new-file":
        patterns = when.get("paths", [])
        excludes = when.get("exclude", [])
        hits = [
            s.path for s in staged
            if s.status == "A"
            and glob_match(s.path, patterns)
            and not glob_match(s.path, excludes)
        ]
        return bool(hits), ", ".join(hits)
    if kind == "new-dir-prefix":
        # locations: [{parent: <prefix>, allow: [<segment>...]}]
        violations: list[str] = []
        seen_dirs: set[tuple[str, str]] = set()  # dedupe (parent, segment)
        for s in staged:
            if s.status != "A":
                continue
            for loc in when.get("locations", []):
                parent = loc.get("parent", "").rstrip("/")
                allow = set(loc.get("allow", []))
                if parent:
                    if not s.path.startswith(parent + "/"):
                        continue
                    rest = s.path[len(parent) + 1:]
                else:
                    rest = s.path
                segs = rest.split("/")
                if len(segs) < 2:
                    # Top-level FILE under this parent, not a new directory.
                    continue
                first = segs[0]
                if first in allow:
                    continue
                key = (parent, first)
                if key in seen_dirs:
                    continue
                seen_dirs.add(key)
                disp = (parent + "/" + first) if parent else first
                violations.append(disp + "/")
        return bool(violations), ", ".join(violations)
    if kind == "path-archive-move":
        src = when.get("from", "").rstrip("/")
        dst = when.get("to", "").rstrip("/")
        hits: list[str] = []
        for s in staged:
            if s.status != "R":
                continue
            if s.rename_from and s.rename_from.startswith(src + "/") \
                    and s.path.startswith(dst + "/"):
                hits.append(f"{s.rename_from} -> {s.path}")
        return bool(hits), ", ".join(hits)
    raise ValueError(f"unknown when.kind: {kind!r}")


# ---------------------------------------------------------------- trailer parsing

TRAILER_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):[ \t]+(.+?)[ \t]*$", re.MULTILINE)


def parse_trailers(message: str) -> list[tuple[str, str]]:
    """Extract (name, value) trailers. Strips leading `# ...` comment lines."""
    body_lines = [ln for ln in message.splitlines() if not ln.startswith("#")]
    body = "\n".join(body_lines)
    return [(m.group(1), m.group(2).strip()) for m in TRAILER_RE.finditer(body)]


def trailer_value_matches(trailer_value: str, value_pattern: str | None) -> bool:
    """If pattern is None, any value matches (presence-only check). Otherwise
    apply regex match (search, not anchored — `pattern` carries its own ^/$)."""
    if value_pattern is None:
        return True
    return bool(re.search(value_pattern, trailer_value))


# ---------------------------------------------------------------- main eval

def eval_rule_pre_commit(rule: dict, staged: list[StagedFile]) -> Violation | None:
    """Evaluate one rule in pre-commit phase. Returns Violation or None."""
    require = rule.get("require", {})
    rkind = require.get("kind")
    if rkind not in ("any-touch", "block"):
        return None  # commit-msg phase rule, ignore here

    fired, detail = fires_when(rule.get("when", {}), staged)
    if not fired:
        return None

    if rkind == "block":
        return Violation(
            rule_id=rule.get("id", "?"),
            rule_num=int(rule.get("rule", 0)),
            summary=rule.get("summary", ""),
            detail=detail,
            hint=require.get("hint", ""),
        )
    if rkind == "any-touch":
        required = require.get("paths", [])
        if any(glob_match(s.path, required) for s in staged):
            return None
        return Violation(
            rule_id=rule.get("id", "?"),
            rule_num=int(rule.get("rule", 0)),
            summary=rule.get("summary", ""),
            detail=detail,
            hint=require.get("hint", ""),
        )
    return None


def eval_rule_commit_msg(rule: dict, staged: list[StagedFile], message: str
                         ) -> Violation | None:
    """Evaluate one rule in commit-msg phase. Returns Violation or None."""
    require = rule.get("require", {})
    rkind = require.get("kind")
    if rkind not in ("trailer", "trailer-forbidden"):
        return None  # pre-commit phase rule, ignore here

    fired, detail = fires_when(rule.get("when", {}), staged)
    if not fired:
        return None

    name = require.get("name", "")
    value_pattern = require.get("value_pattern") or require.get("pattern")
    trailers = parse_trailers(message)
    matching = [(n, v) for (n, v) in trailers
                if n.lower() == name.lower()
                and trailer_value_matches(v, value_pattern)]

    if rkind == "trailer":
        if matching:
            return None
        return Violation(
            rule_id=rule.get("id", "?"),
            rule_num=int(rule.get("rule", 0)),
            summary=rule.get("summary", ""),
            detail=detail,
            hint=require.get("hint", ""),
        )
    if rkind == "trailer-forbidden":
        if not matching:
            return None
        bad = "; ".join(f"{n}: {v}" for (n, v) in matching)
        return Violation(
            rule_id=rule.get("id", "?"),
            rule_num=int(rule.get("rule", 0)),
            summary=rule.get("summary", ""),
            detail=bad,
            hint=require.get("hint", ""),
        )
    return None


# ---------------------------------------------------------------- driver

def load_config(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        print(f"check-rule-attestations: malformed YAML at {path}: {e}",
              file=sys.stderr)
        sys.exit(2)
    if not isinstance(data, dict):
        return []
    rules = data.get("rules") or []
    if not isinstance(rules, list):
        print(f"check-rule-attestations: 'rules' must be a list in {path}",
              file=sys.stderr)
        sys.exit(2)
    return rules


def format_violation(v: Violation) -> str:
    lines = [
        f"  RULE {v.rule_num} VIOLATION ({v.rule_id}): {v.summary}",
    ]
    if v.detail:
        lines.append(f"    Triggered by: {v.detail}")
    if v.hint:
        for hl in v.hint.rstrip().split("\n"):
            lines.append(f"    {hl}")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--phase", choices=["pre-commit", "commit-msg"],
                        required=True)
    parser.add_argument("--message-file",
                        help="commit message file (commit-msg phase only)")
    parser.add_argument("--config", default=str(CONFIG_PATH),
                        help="path to rule-attestations.yaml")
    args = parser.parse_args(argv)

    config_path = Path(args.config)
    rules = load_config(config_path)
    if not rules:
        return 0  # nothing to enforce

    skip_csv = os.environ.get("LATTICE_RULE_ATTESTATIONS_SKIP", "")
    skip_set = {s.strip() for s in skip_csv.split(",") if s.strip()}
    advisory = os.environ.get("LATTICE_RULE_ATTESTATIONS_ADVISORY") == "1"

    staged = get_staged()

    message = ""
    if args.phase == "commit-msg":
        if not args.message_file:
            print("check-rule-attestations: --message-file required for "
                  "--phase commit-msg", file=sys.stderr)
            return 2
        msg_path = Path(args.message_file)
        if not msg_path.exists():
            print(f"check-rule-attestations: message file not found: {msg_path}",
                  file=sys.stderr)
            return 2
        message = msg_path.read_text(encoding="utf-8")

    violations: list[Violation] = []
    for rule in rules:
        rid = rule.get("id", "?")
        if rid in skip_set:
            continue
        try:
            if args.phase == "pre-commit":
                v = eval_rule_pre_commit(rule, staged)
            else:
                v = eval_rule_commit_msg(rule, staged, message)
        except Exception as e:
            print(f"check-rule-attestations: rule {rid} eval error: {e}",
                  file=sys.stderr)
            return 2
        if v is not None:
            violations.append(v)

    if not violations:
        return 0

    print("check-rule-attestations: rule violation(s) detected:")
    for v in violations:
        print(format_violation(v))
    print()

    if advisory:
        print("(LATTICE_RULE_ATTESTATIONS_ADVISORY=1 -- not blocking)")
        return 0
    print("To bypass a specific rule, set "
          "LATTICE_RULE_ATTESTATIONS_SKIP=<rule-id,rule-id> in the environment.")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
