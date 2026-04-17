#!/bin/bash
# release-lock.sh — Release the shared-state commit lock
#
# Usage: bash scripts/release-lock.sh
#
# Always succeeds (idempotent). Safe to call even if no lock is held.

LOCK_DIR=".lattice/commit.lock"

if [ -d "$LOCK_DIR" ]; then
    rm -rf "$LOCK_DIR"
    echo "LOCK RELEASED"
else
    echo "NO LOCK HELD (nothing to release)"
fi
