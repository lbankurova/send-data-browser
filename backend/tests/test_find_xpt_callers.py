"""Guard: every call to _find_xpt_files must unpack the tuple return.

_find_xpt_files returns (xpt_files, empty_xpt_files).  Commit 119dcdf
changed the signature but missed 3 callers, breaking ZIP import.  This
test uses AST analysis to verify all call sites unpack correctly.
"""

import ast
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _collect_calls(tree: ast.Module) -> list[tuple[int, str]]:
    """Return (lineno, assignment_kind) for every _find_xpt_files() call.

    assignment_kind is one of:
      "tuple_unpack" — x, y = _find_xpt_files(...)  ✓
      "bare_assign"  — x = _find_xpt_files(...)      ✗
      "expr"         — bare call, no assignment        (ok, unusual)
      "other"        — something unexpected
    """
    results = []

    for node in ast.walk(tree):
        # Case 1: assignment  — x = call  or  x, y = call
        if isinstance(node, ast.Assign):
            if not isinstance(node.value, ast.Call):
                continue
            call = node.value
            if not _is_find_xpt(call):
                continue
            target = node.targets[0]
            if isinstance(target, ast.Tuple):
                results.append((node.lineno, "tuple_unpack"))
            else:
                results.append((node.lineno, "bare_assign"))

        # Case 2: bare expression statement (unlikely but harmless)
        elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            if _is_find_xpt(node.value):
                results.append((node.lineno, "expr"))

    return results


def _is_find_xpt(call: ast.Call) -> bool:
    """Check whether a Call node is _find_xpt_files(...)."""
    func = call.func
    if isinstance(func, ast.Name) and func.id == "_find_xpt_files":
        return True
    if isinstance(func, ast.Attribute) and func.attr == "_find_xpt_files":
        return True
    return False


def test_all_callers_unpack_tuple():
    """Every _find_xpt_files() call must use tuple unpacking."""
    violations = []

    for py_file in BACKEND.rglob("*.py"):
        # Skip __pycache__
        if "__pycache__" in py_file.parts:
            continue
        try:
            tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        except SyntaxError:
            continue

        for lineno, kind in _collect_calls(tree):
            if kind == "bare_assign":
                rel = py_file.relative_to(BACKEND)
                violations.append(f"  {rel}:{lineno} — bare assignment (must unpack tuple)")

    assert not violations, (
        "_find_xpt_files() returns (xpt_files, empty_xpt_files). "
        "These callers assign to a single variable:\n" + "\n".join(violations)
    )
