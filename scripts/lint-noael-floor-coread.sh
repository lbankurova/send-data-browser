#!/bin/bash
# NOAEL floor co-read lint (F3, hcd-mi-ma-s08-wiring).
#
# Blocks any PR that reads `clinical_confidence` or `hcd_evidence` inside
# view_dataframes.py NOAEL-gate functions (_is_loael_driving* or
# _build_noael_for_groups) without co-consulting `noael_floor_applied` in
# the same function body.
#
# Scope note: this lint is narrow to backend/generator/view_dataframes.py
# by design. Declaring `noael_floor_applied` as an invariant without a
# machine-checked consumption-site guard is the failure mode this lint
# was built to prevent.
#
# Exit codes: 0 = OK; 1 = violation found; 2 = error.

set -u
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PY="python3"
if [ -x "$REPO_ROOT/backend/venv/Scripts/python.exe" ]; then
    PY="$REPO_ROOT/backend/venv/Scripts/python.exe"
elif command -v python3 >/dev/null 2>&1; then
    PY=python3
else
    PY=python
fi

exec "$PY" "$REPO_ROOT/scripts/lint_noael_floor_coread.py" "$@"
