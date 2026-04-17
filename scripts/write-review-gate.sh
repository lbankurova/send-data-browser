#!/bin/bash
#
# Write the review gate file -- BUT ONLY AFTER MECHANICAL CHECKS PASS.
#
# This is the escape hatch for commits that skip the full /lattice:review.
# To prevent agents from using this to bypass all quality gates, this script
# runs the same mechanical checks that /lattice:review runs:
#   1. Executor TypeScript build (if executor files staged)
#
# If any check fails, the gate file is NOT written and the commit stays blocked.
#
# Usage: bash scripts/write-review-gate.sh [verdict] [summary]
#   verdict: "pass" or "pass-with-deviations" (default: "pass")
#   summary: one-line summary (optional)
#
# The gate file is single-use: the pre-commit hook deletes it after
# a successful commit. This ensures every commit goes through review.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
GATE_FILE="$REPO_ROOT/.lattice/review-gate.json"
GATE_DIR="$REPO_ROOT/.lattice"
EXECUTOR_DIR="$REPO_ROOT/executor"

VERDICT="${1:-pass}"
SUMMARY="${2:-Review passed}"

STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
STAGED_EXECUTOR=$(echo "$STAGED_FILES" | grep -c "^executor/" || true)

CHECKS_RUN=0
CHECKS_PASSED=0

echo "========================================"
echo "  Review gate: running mechanical checks"
echo "========================================"
echo ""

# --- Check 1: Executor TypeScript build ---
if [ "$STAGED_EXECUTOR" -gt 0 ]; then
    CHECKS_RUN=$((CHECKS_RUN + 1))
    echo "--- Check: Executor TypeScript build ---"
    if (cd "$EXECUTOR_DIR" && npx tsc --noEmit > /dev/null 2>&1); then
        echo "  PASS"
        CHECKS_PASSED=$((CHECKS_PASSED + 1))
    else
        echo "  FAIL: tsc --noEmit failed"
        echo ""
        echo "  Fix TypeScript errors before the gate can be written."
        echo "  Run: cd executor && npx tsc --noEmit"
        exit 1
    fi
fi

echo ""

# --- All checks passed -- write the gate ---
if [ "$CHECKS_RUN" -eq 0 ]; then
    echo "  No mechanical checks applicable (no code files staged)."
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STAGED_LIST=$(echo "$STAGED_FILES" | tr '\n' ',' | sed 's/,$//')
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "none")

mkdir -p "$GATE_DIR"

cat > "$GATE_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "verdict": "$VERDICT",
  "summary": "$SUMMARY",
  "checks_run": $CHECKS_RUN,
  "checks_passed": $CHECKS_PASSED,
  "staged_files": "$STAGED_LIST",
  "head_at_review": "$COMMIT_HASH",
  "written_by": "write-review-gate.sh"
}
EOF

echo "========================================"
echo "  Review gate written ($CHECKS_PASSED/$CHECKS_RUN checks passed)"
echo "  Verdict: $VERDICT"
echo "  Summary: $SUMMARY"
echo "========================================"
