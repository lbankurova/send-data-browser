#!/bin/bash
# context-meter.sh — Three-signal context pressure meter
#
# Called by PostToolUse hook on Read. Tracks file reads with timestamps.
# Three signals:
#   1. Re-read detection (diagnostic — context already compressed)
#   2. Rolling window volume (prognostic — approaching compression)
#   3. Working set breadth (cognitive — spread too thin)
#
# State file: .lattice/session-reads (timestamped log, auto-trimmed)
# No manual reset needed — rolling window handles session boundaries.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LATTICE_DIR="$REPO_ROOT/.lattice"
STATE_FILE="$LATTICE_DIR/session-reads"

mkdir -p "$LATTICE_DIR"

# Get file path from argument or CLAUDE_TOOL_INPUT
FILE="${1:-}"
if [ -z "$FILE" ]; then
    FILE=$(echo "$CLAUDE_TOOL_INPUT" 2>/dev/null | grep -oP '"file_path"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    exit 0
fi

NOW=$(date +%s)
FILE_SIZE=$(wc -c < "$FILE" 2>/dev/null || echo 0)
FILE_TOKENS=$((FILE_SIZE / 4))

# Normalize path for comparison
NORM_FILE=$(realpath "$FILE" 2>/dev/null || echo "$FILE")

# --- Signal 1: Re-read detection ---
REREAD=""
if [ -f "$STATE_FILE" ]; then
    # Check if this file was read before (any timestamp)
    FIRST_READ=$(grep -F "$NORM_FILE" "$STATE_FILE" 2>/dev/null | head -1 | awk '{print $1}')
    if [ -n "$FIRST_READ" ]; then
        MINUTES_AGO=$(( (NOW - FIRST_READ) / 60 ))
        if [ "$MINUTES_AGO" -gt 5 ]; then
            REREAD="RE-READ: $(basename "$FILE") (first read ~${MINUTES_AGO}min ago). Context compression may have evicted the earlier read. If you're re-reading because you lost the content, consider finishing current task and starting fresh."
        fi
        # Don't double-warn on rapid re-reads (< 5 min) — that's normal reference behavior
    fi
fi

# Append this read to the log
echo "$NOW $FILE_TOKENS $NORM_FILE" >> "$STATE_FILE"

# --- Trim entries older than 60 minutes ---
CUTOFF=$((NOW - 3600))
if [ -f "$STATE_FILE" ]; then
    awk -v cutoff="$CUTOFF" '$1 >= cutoff' "$STATE_FILE" > "${STATE_FILE}.tmp" 2>/dev/null
    mv "${STATE_FILE}.tmp" "$STATE_FILE" 2>/dev/null || true
fi

# --- Signal 2: Rolling window volume (last 30 minutes) ---
WINDOW_CUTOFF=$((NOW - 1800))
RECENT_TOKENS=0
if [ -f "$STATE_FILE" ]; then
    RECENT_TOKENS=$(awk -v cutoff="$WINDOW_CUTOFF" '$1 >= cutoff {sum += $2} END {print sum+0}' "$STATE_FILE")
fi

# --- Signal 3: Working set breadth (last 20 minutes) ---
BREADTH_CUTOFF=$((NOW - 1200))
DISTINCT_FILES=0
if [ -f "$STATE_FILE" ]; then
    DISTINCT_FILES=$(awk -v cutoff="$BREADTH_CUTOFF" '$1 >= cutoff {print $3}' "$STATE_FILE" | sort -u | wc -l)
fi

# --- Output warnings (most severe first) ---

# Re-read is the strongest signal — always show it
if [ -n "$REREAD" ]; then
    echo "$REREAD"
fi

# Volume thresholds
WARN_THRESHOLD=80000
CRITICAL_THRESHOLD=150000

if [ "$RECENT_TOKENS" -ge "$CRITICAL_THRESHOLD" ]; then
    echo "CONTEXT PRESSURE: CRITICAL (~${RECENT_TOKENS} tokens in last 30 min)"
    echo "Reasoning quality is degrading. Finish current task, commit, start fresh."
elif [ "$RECENT_TOKENS" -ge "$WARN_THRESHOLD" ]; then
    echo "CONTEXT PRESSURE: HIGH (~${RECENT_TOKENS} tokens in last 30 min)"
    echo "Consider wrapping up the current task soon."
fi

# Working set breadth
if [ "$DISTINCT_FILES" -ge 15 ]; then
    echo "WORKING SET: ${DISTINCT_FILES} distinct files in last 20 min — attention is spread very thin."
elif [ "$DISTINCT_FILES" -ge 12 ]; then
    echo "WORKING SET: ${DISTINCT_FILES} distinct files in last 20 min — consider narrowing focus."
fi

exit 0
