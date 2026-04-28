#!/bin/bash
# scripts/declare-commit-intent.sh -- declare the file set this session intends to commit.
#
# Pre-commit Step -0.5 reads .lattice/commit-intent.txt and BLOCKS the commit if
# the staged set drifts from the declared set. Catches the autopilot-vs-manual
# staging conflation pattern documented in feedback_concurrent_autopilot_staging.md
# and in 4 prior CONFLATED-COMMIT annotations: 1370c103, 521f1d16, a47ee865,
# abdb31c9.
#
# Usage:
#   bash scripts/declare-commit-intent.sh <topic> <file1> [<file2> ...]
#   bash scripts/declare-commit-intent.sh --add <file1> [<file2> ...]
#   bash scripts/declare-commit-intent.sh --clear
#   bash scripts/declare-commit-intent.sh --show
#
# Holder identity: LATTICE_LOCK_HOLDER env var if set (autopilot path), else
# "manual-pid-$$" (manual path). Surfaced in the intent header so the
# pre-commit message can attribute the holder.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
INTENT_FILE="$REPO_ROOT/.lattice/commit-intent.txt"

usage() {
    cat <<EOM
Usage:
  bash scripts/declare-commit-intent.sh <topic> <file1> [<file2> ...]
  bash scripts/declare-commit-intent.sh --add <file1> [<file2> ...]
  bash scripts/declare-commit-intent.sh --clear
  bash scripts/declare-commit-intent.sh --show

Topic must be a slug (kebab-case or alphanumeric+dashes/underscores). The
file list MUST exactly match the staged set at commit time -- pre-commit
Step -0.5 enforces this. Use --add when the work evolves and additional
files genuinely belong in this commit.
EOM
    exit 1
}

[ "$#" -lt 1 ] && usage

mkdir -p "$(dirname "$INTENT_FILE")"

case "$1" in
    --add)
        shift
        [ "$#" -lt 1 ] && { echo "ERROR: --add needs at least one file" >&2; exit 1; }
        if [ ! -f "$INTENT_FILE" ]; then
            echo "ERROR: no intent file to add to. Run 'declare-commit-intent.sh <topic> <files...>' first." >&2
            exit 1
        fi
        for f in "$@"; do
            # Reject duplicate adds
            if grep -Fxq "$f" "$INTENT_FILE" 2>/dev/null; then
                echo "WARN: $f already in intent (skipping)"
                continue
            fi
            echo "$f" >> "$INTENT_FILE"
        done
        echo "Added $# file(s) to intent. Total declared:"
        bash "$0" --show | tail -n +5
        ;;
    --clear)
        if [ -f "$INTENT_FILE" ]; then
            rm -f "$INTENT_FILE"
            echo "Cleared $INTENT_FILE"
        else
            echo "(no intent file to clear)"
        fi
        ;;
    --show)
        if [ ! -f "$INTENT_FILE" ]; then
            echo "(no intent file)"
        else
            cat "$INTENT_FILE"
        fi
        ;;
    -*)
        echo "ERROR: unknown flag: $1" >&2
        usage
        ;;
    *)
        topic="$1"
        shift
        [ "$#" -lt 1 ] && { echo "ERROR: declare needs at least one file" >&2; usage; }
        # Validate topic slug
        if ! [[ "$topic" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]]; then
            echo "ERROR: topic must be a slug (alphanumeric + - _, starting with alphanumeric)" >&2
            exit 1
        fi
        holder="${LATTICE_LOCK_HOLDER:-manual-pid-$$}"
        timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        {
            echo "# Commit intent file -- consumed by hooks/pre-commit Step -0.5"
            echo "# Single-shot: cleared by hooks/post-commit on successful commit."
            echo "# See feedback_concurrent_autopilot_staging.md for the pattern this prevents."
            echo "Topic: $topic"
            echo "Holder: $holder"
            echo "Created: $timestamp"
            echo ""
            for f in "$@"; do
                echo "$f"
            done
        } > "$INTENT_FILE"
        echo "Declared intent for $# file(s) in topic '$topic' (holder: $holder)."
        ;;
esac
