#!/bin/bash
#
# complexity-check.sh — quick complexity spot-check for a single file
# Used by: Claude hooks (post-edit), pre-commit hooks (advisory)
#
# Usage: bash complexity-check.sh <file-path>
# Exit 0 = OK, Exit 1 = warning (prints to stderr)
#
# Thresholds are advisory (warnings, not blocks) — the architect agent
# handles judgment calls. This script catches mechanical violations.

FILE="$1"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    exit 0  # No file or doesn't exist — skip silently
fi

WARNINGS=""

# --- File line count ---
LINE_COUNT=$(wc -l < "$FILE" 2>/dev/null)

case "$FILE" in
    *.py)
        THRESHOLD=500
        ;;
    *.ts|*.tsx)
        THRESHOLD=800
        ;;
    *)
        exit 0  # Not a monitored file type
        ;;
esac

if [ "$LINE_COUNT" -gt "$THRESHOLD" ]; then
    WARNINGS="${WARNINGS}COMPLEXITY WARNING: ${FILE} is ${LINE_COUNT} lines (threshold: ${THRESHOLD}). Consider splitting.\n"
fi

# --- Function length (Python) ---
if [[ "$FILE" == *.py ]]; then
    # Find functions longer than 80 lines (rough heuristic: count lines between def statements)
    LONG_FUNCS=$(awk '
        /^[[:space:]]*def / {
            if (fname != "" && (NR - start) > 80) {
                printf "  %s (%d lines)\n", fname, NR - start
            }
            fname = $0
            sub(/^[[:space:]]*def /, "", fname)
            sub(/\(.*/, "", fname)
            start = NR
        }
        END {
            if (fname != "" && (NR - start) > 80) {
                printf "  %s (%d lines)\n", fname, NR - start
            }
        }
    ' "$FILE")

    if [ -n "$LONG_FUNCS" ]; then
        WARNINGS="${WARNINGS}COMPLEXITY WARNING: Long functions in ${FILE}:\n${LONG_FUNCS}\n"
    fi
fi

# --- Function length (TypeScript/TSX) ---
if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then
    LONG_FUNCS=$(awk '
        /^[[:space:]]*(export )?(function |const [a-zA-Z]+ = |async function )/ {
            if (fname != "" && (NR - start) > 120) {
                printf "  %s (%d lines)\n", fname, NR - start
            }
            fname = $0
            sub(/^[[:space:]]*(export )?(async )?/, "", fname)
            sub(/[=(].*/, "", fname)
            start = NR
        }
        END {
            if (fname != "" && (NR - start) > 120) {
                printf "  %s (%d lines)\n", fname, NR - start
            }
        }
    ' "$FILE")

    if [ -n "$LONG_FUNCS" ]; then
        WARNINGS="${WARNINGS}COMPLEXITY WARNING: Long functions in ${FILE}:\n${LONG_FUNCS}\n"
    fi
fi

# --- Bare lint exemptions (no justification comment) ---
BARE_NOQA=$(grep -n "# noqa:" "$FILE" 2>/dev/null | grep -v "#.*noqa:.*#\|#.*noqa:.*--" || true)
BARE_ESLINT=$(grep -n "eslint-disable" "$FILE" 2>/dev/null | grep -v "//.*eslint-disable.*--\|//.*eslint-disable.*//" || true)

if [ -n "$BARE_NOQA" ]; then
    WARNINGS="${WARNINGS}LINT EXEMPTION WARNING: Bare noqa without justification in ${FILE}:\n${BARE_NOQA}\n"
fi
if [ -n "$BARE_ESLINT" ]; then
    WARNINGS="${WARNINGS}LINT EXEMPTION WARNING: Bare eslint-disable without justification in ${FILE}:\n${BARE_ESLINT}\n"
fi

# --- Output ---
if [ -n "$WARNINGS" ]; then
    echo -e "$WARNINGS" >&2
    exit 1
fi

exit 0
