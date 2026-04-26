#!/bin/bash
#
# Write the review gate file -- BUT ONLY AFTER MECHANICAL CHECKS PASS.
#
# This is the escape hatch for commits that skip the full /lattice:review.
# To prevent agents from using this to bypass all quality gates, this script
# runs the same mechanical checks that /lattice:review runs:
#   1. Executor TypeScript build (if executor files staged)
#   2. Algorithm-defensibility verdict (if algorithmic-code paths staged) -- per CLAUDE.md rule 19
#
# If any check fails, the gate file is NOT written and the commit stays blocked.
#
# Usage: bash scripts/write-review-gate.sh [verdict] [summary]
#   verdict: "pass" or "pass-with-deviations" (default: "pass")
#   summary: one-line summary (optional)
#
# Environment variables:
#   LATTICE_ALGORITHM_CHECK -- required when algorithmic-code paths are staged
#     Acceptable values: "pass:<one-line evidence>", "skipped:<rationale>", "fail:<reason>"
#     Example: export LATTICE_ALGORITHM_CHECK="pass:NOAEL on PointCross BW = below-lowest, defensible because all 3 driver hits are p<0.05 with consistent direction"
#
# Algorithmic-code paths are read from .lattice/algorithm-paths.txt (one glob per line).
# Default trigger paths if file absent: derive-summaries.ts, endpoint-confidence.ts,
# findings-rail-engine.ts, cross-domain-syndromes.ts, syndrome-rules.ts,
# backend/services/analysis/**/*.py.
#
# The gate file is single-use: the pre-commit hook deletes it after
# a successful commit. This ensures every commit goes through review.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
GATE_FILE="$REPO_ROOT/.lattice/review-gate.json"
GATE_DIR="$REPO_ROOT/.lattice"
EXECUTOR_DIR="$REPO_ROOT/executor"
ALGO_PATHS_FILE="$REPO_ROOT/.lattice/algorithm-paths.txt"

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

# --- Check 2: Algorithm-defensibility verdict (CLAUDE.md rule 19) ---
# Trigger if any staged file matches an algorithmic-code path glob.

# Build the regex from algorithm-paths.txt (or use defaults)
ALGO_REGEX=""
if [ -f "$ALGO_PATHS_FILE" ]; then
    while IFS= read -r line; do
        # Skip blank lines and comments
        [ -z "$line" ] && continue
        [ "${line:0:1}" = "#" ] && continue
        # Convert glob to regex fragment (rough)
        frag=$(echo "$line" | sed 's|/|\\/|g; s|\*\*|.*|g; s|\*|[^/]*|g')
        if [ -z "$ALGO_REGEX" ]; then
            ALGO_REGEX="$frag"
        else
            ALGO_REGEX="$ALGO_REGEX|$frag"
        fi
    done < "$ALGO_PATHS_FILE"
else
    ALGO_REGEX='derive-summaries\.ts|endpoint-confidence\.ts|findings-rail-engine\.ts|cross-domain-syndromes\.ts|syndrome-rules\.ts|backend/services/analysis/.*\.py'
fi

STAGED_ALGO=$(echo "$STAGED_FILES" | grep -cE "$ALGO_REGEX" || true)
ALGO_VERDICT="${LATTICE_ALGORITHM_CHECK:-}"

if [ "$STAGED_ALGO" -gt 0 ]; then
    CHECKS_RUN=$((CHECKS_RUN + 1))
    echo "--- Check: Algorithm defensibility (rule 19) ---"
    echo "  Staged algorithmic-code files: $STAGED_ALGO"
    if [ -z "$ALGO_VERDICT" ]; then
        echo "  FAIL: No LATTICE_ALGORITHM_CHECK env set."
        echo ""
        echo "  Algorithmic-code paths are staged. CLAUDE.md rule 19 requires you to:"
        echo "    1. Run the algorithm against PointCross + 1 other study using generated JSON."
        echo "    2. Record the actual output (NOAEL/LOAEL/score/classification)."
        echo "    3. Answer: would a regulatory toxicologist agree?"
        echo ""
        echo "  Then export the verdict and re-run this script:"
        echo '    export LATTICE_ALGORITHM_CHECK="pass:NOAEL on PointCross BW = X, defensible because Y"'
        echo '    export LATTICE_ALGORITHM_CHECK="fail:<reason>"  # blocks gate, escalate'
        echo '    export LATTICE_ALGORITHM_CHECK="skipped:<rationale>"  # last resort, recorded'
        echo ""
        echo "  See ESCALATION.md > BUG-031 for an exemplar of the failure mode."
        exit 1
    fi
    case "$ALGO_VERDICT" in
        fail:*)
            echo "  FAIL: Algorithm verdict reports failure."
            echo "  Verdict: $ALGO_VERDICT"
            echo ""
            echo "  Escalate to ESCALATION.md and revert the consumer change."
            echo "  Do NOT ship a UI/consumer that locks in an indefensible algorithm output."
            exit 1
            ;;
        pass:*|skipped:*)
            echo "  PASS: $ALGO_VERDICT"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
            ;;
        *)
            echo "  FAIL: LATTICE_ALGORITHM_CHECK must start with 'pass:', 'fail:', or 'skipped:'"
            echo "  Got: $ALGO_VERDICT"
            exit 1
            ;;
    esac
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

# Escape ALGO_VERDICT for JSON (replace " with \")
ALGO_VERDICT_JSON=$(echo "${ALGO_VERDICT:-not-applicable}" | sed 's/"/\\"/g')

cat > "$GATE_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "verdict": "$VERDICT",
  "summary": "$SUMMARY",
  "checks_run": $CHECKS_RUN,
  "checks_passed": $CHECKS_PASSED,
  "algorithm_check": "$ALGO_VERDICT_JSON",
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
