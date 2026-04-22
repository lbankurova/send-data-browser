"""AST-based lint for the NOAEL floor co-read invariant (F3).

Scope: scans `backend/generator/view_dataframes.py`. For any function whose
name matches `_is_loael_driving*` or `_build_noael_for_groups`, if the
function body references either `clinical_confidence` or `hcd_evidence` as
attribute access, dict key, or a string literal passed to getattr / .get,
then the SAME function body MUST also reference `noael_floor_applied` as
an attribute access, dict key, or string literal.

Known coverage (docstring-documented):
  - Direct attribute / subscript / .get("clinical_confidence")
  - Same-file helper calls (the helper's definition is scanned)
  - String-constant construction ("clinical_" + "confidence")
  - getattr(obj, "clinical_confidence")

Known limits:
  - Cross-module helpers (the helper lives in another file)
  - Runtime dict unpacking (**finding)
Those patterns require code review; see
`docs/_internal/architecture/s08-hcd-wiring.md` for the convention.

Usage:
  python scripts/lint_noael_floor_coread.py [path-to-file ...]

Exit codes:
  0 : no violation or nothing to check
  1 : violation found (one or more functions lack noael_floor_applied co-read)
  2 : unexpected error / cannot parse
"""
from __future__ import annotations

import ast
import fnmatch
import sys
from pathlib import Path
from typing import Iterable

_GUARDED_TOKENS = {"clinical_confidence", "hcd_evidence"}
_REQUIRED_TOKEN = "noael_floor_applied"
_GUARDED_FUNC_PATTERNS = ("_is_loael_driving*", "_build_noael_for_groups")

# Target file(s). The lint is scoped narrowly per F3 AC-F3-3.
_DEFAULT_TARGETS = (
    Path("backend/generator/view_dataframes.py"),
)


class _TokenScanner(ast.NodeVisitor):
    """Collects string identifiers used in a function body.

    Catches:
      - Attribute access: obj.clinical_confidence
      - Dict subscript: d["clinical_confidence"]
      - `.get("clinical_confidence")` call args
      - `getattr(x, "clinical_confidence")` call args
      - String constant composition: "clinical_" + "confidence"
        (constant-folded to the concatenated string by the folding pass)
    """

    def __init__(self) -> None:
        self.tokens: set[str] = set()

    def visit_Attribute(self, node: ast.Attribute) -> None:
        self.tokens.add(node.attr)
        self.generic_visit(node)

    def visit_Constant(self, node: ast.Constant) -> None:
        if isinstance(node.value, str):
            self.tokens.add(node.value)
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        # getattr(obj, "name")
        if (
            isinstance(node.func, ast.Name) and node.func.id == "getattr"
            and node.args
        ):
            for arg in node.args[1:]:
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    self.tokens.add(arg.value)
        # obj.get("name") / obj.pop("name") / obj.setdefault("name", ...) --
        # dict subscript via method call is the dominant access pattern in
        # view_dataframes.py. Without this branch the lint misses the primary
        # bypass mode.
        if isinstance(node.func, ast.Attribute) and node.func.attr in {
            "get", "pop", "setdefault",
        } and node.args:
            first = node.args[0]
            if isinstance(first, ast.Constant) and isinstance(first.value, str):
                self.tokens.add(first.value)
        self.generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp) -> None:
        # Constant-fold string concatenation of two literals (Add).
        if isinstance(node.op, ast.Add):
            left = node.left
            right = node.right
            if (
                isinstance(left, ast.Constant) and isinstance(left.value, str)
                and isinstance(right, ast.Constant) and isinstance(right.value, str)
            ):
                self.tokens.add(left.value + right.value)
        self.generic_visit(node)


def _collect_tokens_from_body(body: list[ast.stmt]) -> set[str]:
    scanner = _TokenScanner()
    for stmt in body:
        scanner.visit(stmt)
    return scanner.tokens


def _matches_guarded(name: str) -> bool:
    return any(fnmatch.fnmatchcase(name, pat) for pat in _GUARDED_FUNC_PATTERNS)


def _expand_with_same_file_helpers(
    func_tokens: set[str],
    func_bodies_by_name: dict[str, list[ast.stmt]],
    called_names: set[str],
) -> set[str]:
    """For any called name that resolves to a same-file helper, merge its tokens."""
    expanded = set(func_tokens)
    seen: set[str] = set()
    stack = list(called_names)
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        body = func_bodies_by_name.get(n)
        if body is None:
            continue
        helper_tokens = _collect_tokens_from_body(body)
        expanded |= helper_tokens
        # Recurse into helpers-of-helpers
        helper_calls = _collect_called_names(body)
        stack.extend(helper_calls - seen)
    return expanded


def _collect_called_names(body: list[ast.stmt]) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(ast.Module(body=body, type_ignores=[])):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            names.add(node.func.id)
    return names


def check_file(path: Path) -> list[str]:
    """Return list of violation messages for `path`."""
    if not path.exists():
        return []
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    except SyntaxError as exc:
        return [f"{path}: parse error -- {exc}"]

    # Build a map of all top-level functions (for same-file helper expansion).
    func_bodies_by_name: dict[str, list[ast.stmt]] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            func_bodies_by_name[node.name] = list(node.body)

    violations: list[str] = []
    for name, body in func_bodies_by_name.items():
        if not _matches_guarded(name):
            continue
        tokens = _collect_tokens_from_body(body)
        called = _collect_called_names(body)
        tokens = _expand_with_same_file_helpers(
            tokens, func_bodies_by_name, called
        )
        guarded_hits = tokens & _GUARDED_TOKENS
        if guarded_hits and _REQUIRED_TOKEN not in tokens:
            hits = ", ".join(sorted(guarded_hits))
            violations.append(
                f"{path}:{name}: reads {{{hits}}} but does not co-read '{_REQUIRED_TOKEN}'. "
                f"See docs/_internal/architecture/s08-hcd-wiring.md (F3 invariant)."
            )
    return violations


def main(argv: Iterable[str]) -> int:
    args = list(argv)
    targets = [Path(a) for a in args] if args else list(_DEFAULT_TARGETS)

    all_violations: list[str] = []
    for t in targets:
        all_violations.extend(check_file(t))

    if all_violations:
        for v in all_violations:
            print("LINT FAIL:", v, file=sys.stderr)
        return 1
    print("lint-noael-floor-coread: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
