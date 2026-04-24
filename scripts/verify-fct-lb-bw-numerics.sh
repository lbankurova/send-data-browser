#!/usr/bin/env bash
# verify-fct-lb-bw-numerics.sh
#
# AC-F1-1 / AC-F2-1 / AC-F3-1: assert FCT registry bands byte-match the
# research-doc ground truth for entries with literal JSON fragments in
# docs/_internal/research/fct-lb-bw-band-values.md (sections 7.1, 7.2, 7.6).
#
# Scope (MINOR 3 resolution -- covers only the entries the research doc
# specified as literal JSON):
#   LB.ALT.up, LB.AST.up, LB.TBILI.up, LB.ALP.up, LB.GGT.up   (sec 7.1)
#   LB.BUN.up, LB.CREAT.up                                     (sec 7.2)
#   BW.BW.down                                         (sec 7.6)
#
# OUT OF SCOPE (verified by manual PR-description checklist instead):
#   LB.CHOL.up, LB.CHOL.down, LB.GLUC.up, LB.GLUC.down,
#   LB.TP.down, LB.ALB.down  (prose references in sec 2.3 / 2.4)
#   All 12 LB hematology entries  (prose references in sec 3.1)
#
# Thin wrapper around the Python verifier (no jq dependency required on
# Windows dev boxes; jq is optional and not in default Git Bash install).
# Exit: 0 on all-match, 1 on any mismatch, 2 on missing tooling.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${ROOT}/backend/venv/Scripts/python.exe"

if [[ ! -x "$PY" ]]; then
  # Fall back to system python on non-Windows dev boxes
  if command -v python3 > /dev/null 2>&1; then
    PY="python3"
  elif command -v python > /dev/null 2>&1; then
    PY="python"
  else
    echo "ERROR: No Python interpreter found (checked backend/venv, python3, python)" >&2
    exit 2
  fi
fi

exec "$PY" "${ROOT}/scripts/verify_fct_lb_bw_numerics.py" "$@"
