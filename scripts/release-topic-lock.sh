#!/bin/bash
# release-topic-lock.sh — Release a per-topic WIP lock
#
# Usage: bash scripts/release-topic-lock.sh <topic>
#
# Always succeeds (idempotent). Safe to call even if no lock is held.

TOPIC="${1:?Usage: release-topic-lock.sh <topic>}"
LOCK_DIR=".lattice/cycle-lock/$TOPIC"

if [ -d "$LOCK_DIR" ]; then
    rm -rf "$LOCK_DIR"
    echo "TOPIC LOCK RELEASED: $TOPIC"
else
    echo "NO TOPIC LOCK HELD for $TOPIC (nothing to release)"
fi
