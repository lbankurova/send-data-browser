#!/bin/bash
# context-meter.sh — Track cumulative context load per session
#
# Called by PostToolUse hook on Read. Tracks file sizes read in this session.
# Warns at thresholds so the agent knows when to suggest a fresh session.
#
# State file: .lattice/session-context (cleared on new session or manually)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LATTICE_DIR="$REPO_ROOT/.lattice"
STATE_FILE="$LATTICE_DIR/session-context"

mkdir -p "$LATTICE_DIR"

# Get file path from argument or CLAUDE_TOOL_INPUT
FILE="${1:-}"
if [ -z "$FILE" ]; then
    FILE=$(echo "$CLAUDE_TOOL_INPUT" 2>/dev/null | grep -oP '"file_path"\s*:\s*"\K[^"]+' 2>/dev/null || true)
fi

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    exit 0
fi

# Get file size in bytes
FILE_SIZE=$(wc -c < "$FILE" 2>/dev/null || echo 0)

# Approximate tokens (1 token ≈ 4 chars)
FILE_TOKENS=$((FILE_SIZE / 4))

# Read current cumulative total
if [ -f "$STATE_FILE" ]; then
    CUMULATIVE=$(cat "$STATE_FILE")
else
    CUMULATIVE=0
fi

# Update cumulative
CUMULATIVE=$((CUMULATIVE + FILE_TOKENS))
echo "$CUMULATIVE" > "$STATE_FILE"

# Thresholds (approximate tokens from file reads only — actual context includes
# conversation, tool outputs, system prompts, etc.)
# These are conservative because file reads are ~40-60% of total context load
WARN_THRESHOLD=80000    # ~320KB of files read
CRITICAL_THRESHOLD=150000  # ~600KB of files read

if [ "$CUMULATIVE" -ge "$CRITICAL_THRESHOLD" ]; then
    echo "CONTEXT PRESSURE: CRITICAL (~${CUMULATIVE} tokens from file reads alone)"
    echo "Total files loaded this session have consumed significant context."
    echo "Quality of reasoning, attention to detail, and recall of earlier"
    echo "conversation will degrade from here."
    echo ""
    echo "Recommended actions:"
    echo "  1. Finish current task and commit"
    echo "  2. Run /lattice:pause-work to save state"
    echo "  3. Start a fresh session for the next task"
elif [ "$CUMULATIVE" -ge "$WARN_THRESHOLD" ]; then
    echo "CONTEXT PRESSURE: HIGH (~${CUMULATIVE} tokens from file reads)"
    echo "Consider wrapping up the current task soon."
    echo "Complex multi-file operations may produce lower quality results."
fi
