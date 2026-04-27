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
#   LATTICE_ATTESTATIONS -- optional JSON array of attestation entries (single-source mode).
#     Mutually exclusive with .lattice/pending-attestations.json. If both exist, the file
#     wins and the env var is ignored (with a stderr warning).
#     Each entry MUST be an object with required fields:
#       kind       (string, non-empty)  e.g. "peer-review", "bug-pattern", "retro-action"
#       ref        (string, non-empty)  pointer to source artifact (skill name, pattern id, BUG id)
#       verdict    (string, non-empty)  kind-specific verdict tag
#       rationale  (string, >= 10 chars after trim, not in {"n/a","idk","na","none","tbd","todo","same","same as before"})
#     Optional:
#       agent_id   (string)
#     Additional fields are preserved as-is.
#
# Pending-attestation file (preferred for multiple entries -- composable):
#   .lattice/pending-attestations.json -- JSON array, same schema as LATTICE_ATTESTATIONS.
#   Use scripts/append-attestation.sh to compose entries, or write directly.
#   The file is consumed (deleted) after a successful gate write.
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
PENDING_ATTESTATIONS_FILE="$REPO_ROOT/.lattice/pending-attestations.json"

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

# --- Check 3: Attestations (SIMPLIFY-1 unified format) ---
# Source order: pending-attestations.json wins over LATTICE_ATTESTATIONS env.
# Both are validated with the same Python helper. Empty/missing => attestations: [].
# F3 (peer-review), F6 (bug-pattern), F7 (retro-action) all write attestation
# entries via this path; this script only validates structure, not kind-semantics.

if [ -f "$PENDING_ATTESTATIONS_FILE" ]; then
    if [ -n "${LATTICE_ATTESTATIONS:-}" ]; then
        echo "  WARNING: both .lattice/pending-attestations.json and LATTICE_ATTESTATIONS env are set." 1>&2
        echo "           Using the file; env is ignored." 1>&2
    fi
    echo "--- Check: Attestations (file) ---"
elif [ -n "${LATTICE_ATTESTATIONS:-}" ]; then
    echo "--- Check: Attestations (env) ---"
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

# Pass user-controllable strings to Python via env to avoid heredoc-quoting hazards.
# Python builds the gate JSON, validating attestations along the way.
export _GATE_FILE="$GATE_FILE"
export _PENDING_FILE="$PENDING_ATTESTATIONS_FILE"
export _TIMESTAMP="$TIMESTAMP"
export _VERDICT="$VERDICT"
export _SUMMARY="$SUMMARY"
export _CHECKS_RUN="$CHECKS_RUN"
export _CHECKS_PASSED="$CHECKS_PASSED"
export _ALGO_VERDICT="${ALGO_VERDICT:-not-applicable}"
export _STAGED_LIST="$STAGED_LIST"
export _COMMIT_HASH="$COMMIT_HASH"

PYTHONIOENCODING=utf-8 python << 'PYEOF'
import json
import os
import sys

gate_file = os.environ["_GATE_FILE"]
pending_file = os.environ["_PENDING_FILE"]

REQUIRED_FIELDS = ("kind", "ref", "verdict", "rationale")
TRIVIAL_RATIONALES = {
    "n/a", "na", "idk", "none", "tbd", "todo", "same", "same as before",
    "no", "yes", "ok", "fine", "done", ".",
}
MIN_RATIONALE_LEN = 10

# Source attestations.
raw = None
source = None
if os.path.exists(pending_file):
    source = pending_file
    try:
        with open(pending_file, "r", encoding="utf-8") as fh:
            raw = fh.read()
    except OSError as exc:
        print("  FAIL: cannot read %s: %s" % (pending_file, exc), file=sys.stderr)
        sys.exit(1)
elif os.environ.get("LATTICE_ATTESTATIONS"):
    source = "LATTICE_ATTESTATIONS env"
    raw = os.environ["LATTICE_ATTESTATIONS"]

attestations = []
if raw is not None:
    raw_stripped = raw.strip()
    if raw_stripped == "":
        attestations = []
    else:
        try:
            attestations = json.loads(raw_stripped)
        except json.JSONDecodeError as exc:
            print("  FAIL: attestations source (%s) is not valid JSON: %s" % (source, exc), file=sys.stderr)
            sys.exit(1)
        if not isinstance(attestations, list):
            print("  FAIL: attestations must be a JSON array (got %s)" % type(attestations).__name__, file=sys.stderr)
            sys.exit(1)

defects = []
for i, entry in enumerate(attestations):
    if not isinstance(entry, dict):
        defects.append("entry[%d]: not an object (got %s)" % (i, type(entry).__name__))
        continue
    for field in REQUIRED_FIELDS:
        if field not in entry:
            defects.append("entry[%d]: missing required field '%s'" % (i, field))
            continue
        value = entry[field]
        if not isinstance(value, str):
            defects.append("entry[%d].%s: must be a string (got %s)" % (i, field, type(value).__name__))
            continue
        if value.strip() == "":
            defects.append("entry[%d].%s: must be non-empty" % (i, field))
    rationale = entry.get("rationale")
    if isinstance(rationale, str):
        normalized = rationale.strip().lower()
        if normalized in TRIVIAL_RATIONALES:
            defects.append("entry[%d].rationale: trivial value %r is rejected (use a real reason)" % (i, rationale))
        elif len(normalized) < MIN_RATIONALE_LEN:
            defects.append(
                "entry[%d].rationale: too short (%d chars; minimum %d) -- write a one-line reason"
                % (i, len(normalized), MIN_RATIONALE_LEN)
            )

# Reject duplicate (kind, ref) pairs within the same gate -- two attestations of
# the same kind for the same artifact is almost always a copy/paste defect.
seen = {}
for i, entry in enumerate(attestations):
    if not isinstance(entry, dict):
        continue
    kind = entry.get("kind") if isinstance(entry.get("kind"), str) else None
    ref = entry.get("ref") if isinstance(entry.get("ref"), str) else None
    if kind and ref:
        key = (kind, ref)
        if key in seen:
            defects.append(
                "entry[%d]: duplicate (kind=%r, ref=%r) -- already at entry[%d]"
                % (i, kind, ref, seen[key])
            )
        else:
            seen[key] = i

if defects:
    print("  FAIL: attestation validation produced %d defect(s):" % len(defects), file=sys.stderr)
    for d in defects:
        print("    - %s" % d, file=sys.stderr)
    print("", file=sys.stderr)
    print("  See scripts/append-attestation.sh for the canonical composition path.", file=sys.stderr)
    sys.exit(1)

if attestations:
    print("  Attestations validated (%d entries from %s)." % (len(attestations), source))

gate = {
    "timestamp": os.environ["_TIMESTAMP"],
    "verdict": os.environ["_VERDICT"],
    "summary": os.environ["_SUMMARY"],
    "checks_run": int(os.environ["_CHECKS_RUN"]),
    "checks_passed": int(os.environ["_CHECKS_PASSED"]),
    "algorithm_check": os.environ["_ALGO_VERDICT"],
    "attestations": attestations,
    "staged_files": os.environ["_STAGED_LIST"],
    "head_at_review": os.environ["_COMMIT_HASH"],
    "written_by": "write-review-gate.sh",
}

with open(gate_file, "w", encoding="utf-8") as fh:
    json.dump(gate, fh, indent=2)
    fh.write("\n")

# Consume the pending file so the next gate write does not pick up stale
# attestations. Single-use, mirroring the gate semantics.
if os.path.exists(pending_file):
    try:
        os.remove(pending_file)
    except OSError as exc:
        print("  WARNING: could not delete %s: %s" % (pending_file, exc), file=sys.stderr)
PYEOF

GATE_RC=$?
if [ "$GATE_RC" -ne 0 ]; then
    exit "$GATE_RC"
fi

echo "========================================"
echo "  Review gate written ($CHECKS_PASSED/$CHECKS_RUN checks passed)"
echo "  Verdict: $VERDICT"
echo "  Summary: $SUMMARY"
echo "========================================"
