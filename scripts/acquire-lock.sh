#!/bin/bash
# acquire-lock.sh — Acquire the shared-state commit lock
#
# Usage: bash scripts/acquire-lock.sh [holder-name] [--poll]
#   holder-name: identifier for who's holding the lock (default: "unknown")
#   --poll: wait and retry instead of failing immediately
#
# Exit codes:
#   0 — lock acquired
#   1 — lock held by another agent (no --poll)
#   2 — timeout waiting for lock (with --poll)
#
# Lock mechanism: mkdir is atomic on all platforms. .lattice/commit.lock/
# directory existence IS the lock. Metadata inside for diagnostics.

set -euo pipefail

LOCK_DIR=".lattice/commit.lock"
HOLDER="${1:-unknown}"
POLL=false
POLL_INTERVAL=30    # seconds between retries
MAX_WAIT=600        # 10 minutes max wait
STALE_THRESHOLD=300 # 5 minutes = stale lock

# Check for --poll flag
for arg in "$@"; do
    if [ "$arg" = "--poll" ]; then
        POLL=true
    fi
done

# Remove --poll from holder name if it was passed as first arg
if [ "$HOLDER" = "--poll" ]; then
    HOLDER="unknown"
fi

acquire() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        # Lock acquired — write metadata
        echo -e "holder: $HOLDER\nacquired: $(date -Iseconds)\npid: $$" > "$LOCK_DIR/meta"
        echo "LOCK ACQUIRED by $HOLDER"
        return 0
    fi
    return 1
}

check_stale() {
    if [ ! -f "$LOCK_DIR/meta" ]; then
        # Lock dir exists but no metadata — probably stale
        echo "STALE LOCK (no metadata) — force-acquiring"
        rm -rf "$LOCK_DIR"
        return 0
    fi

    # Check age of lock
    local lock_time
    lock_time=$(stat -c %Y "$LOCK_DIR/meta" 2>/dev/null || stat -f %m "$LOCK_DIR/meta" 2>/dev/null || echo 0)
    local now
    now=$(date +%s)
    local age=$((now - lock_time))

    if [ "$age" -gt "$STALE_THRESHOLD" ]; then
        local holder
        holder=$(head -1 "$LOCK_DIR/meta" 2>/dev/null || echo "unknown")
        echo "STALE LOCK ($age seconds old, $holder) — force-acquiring"
        rm -rf "$LOCK_DIR"
        return 0
    fi
    return 1
}

show_holder() {
    if [ -f "$LOCK_DIR/meta" ]; then
        cat "$LOCK_DIR/meta"
    else
        echo "(no metadata)"
    fi
}

# Ensure .lattice/ exists
mkdir -p .lattice

# Try to acquire
if acquire; then
    exit 0
fi

# Lock is held — check if stale
if check_stale; then
    if acquire; then
        exit 0
    fi
fi

# Lock is held and not stale
if [ "$POLL" = false ]; then
    echo "LOCK HELD — cannot acquire"
    show_holder
    exit 1
fi

# Poll mode — wait for lock
echo "LOCK HELD — waiting (poll every ${POLL_INTERVAL}s, max ${MAX_WAIT}s)"
show_holder
waited=0
while [ "$waited" -lt "$MAX_WAIT" ]; do
    sleep "$POLL_INTERVAL"
    waited=$((waited + POLL_INTERVAL))

    # Check stale on every retry
    if check_stale 2>/dev/null; then
        if acquire; then
            exit 0
        fi
    fi

    if acquire; then
        echo "(waited ${waited}s)"
        exit 0
    fi
    echo "... still locked (${waited}s elapsed)"
done

echo "TIMEOUT — lock not acquired after ${MAX_WAIT}s"
show_holder
exit 2
