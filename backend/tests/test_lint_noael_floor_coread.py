"""Meta-test for scripts/lint_noael_floor_coread.py (F3 AC-F3-2).

Runs the lint against 5 fixture files:
  - 4 violation fixtures (direct / helper / indirect / getattr) -- must FAIL
  - 1 compliant fixture -- must PASS

This is the bypass-coverage suite -- every pattern it covers is what keeps
the defensive invariant alive against future NOAEL-gate refactors.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_SCRIPTS = _REPO_ROOT / "scripts"
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

import lint_noael_floor_coread as lint  # noqa: E402


_FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.mark.parametrize("fixture_name", [
    "lint_noael_violation_direct.py",
    "lint_noael_violation_helper.py",
    "lint_noael_violation_indirect.py",
    "lint_noael_violation_getattr.py",
    "lint_noael_violation_dict_get.py",
])
def test_violation_fixtures_fire(fixture_name: str):
    path = _FIXTURE_DIR / fixture_name
    assert path.exists(), f"fixture missing: {path}"
    violations = lint.check_file(path)
    assert violations, f"expected lint to fire on {fixture_name}, got none"


def test_compliant_fixture_passes():
    path = _FIXTURE_DIR / "lint_noael_compliant.py"
    assert path.exists(), f"fixture missing: {path}"
    violations = lint.check_file(path)
    assert not violations, f"expected no lint violations, got: {violations}"


def test_main_cli_exits_zero_for_compliant():
    fixture = _FIXTURE_DIR / "lint_noael_compliant.py"
    assert lint.main([str(fixture)]) == 0


def test_main_cli_exits_nonzero_for_violation():
    fixture = _FIXTURE_DIR / "lint_noael_violation_direct.py"
    assert lint.main([str(fixture)]) == 1
