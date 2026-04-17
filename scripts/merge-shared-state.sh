#!/bin/bash
# merge-shared-state.sh — Refresh shared state files from git HEAD, re-apply local additions
#
# Usage: bash scripts/merge-shared-state.sh
#
# Called AFTER acquire-lock.sh, BEFORE git add/commit.
#
# Problem: Multiple agents modify the same shared files (REGISTRY.md, TODO.md,
# decisions.log, MANIFEST.md). If Agent A commits first, Agent B's working copy
# is based on a stale version and will overwrite A's changes.
#
# Solution: For each shared file that has local modifications:
#   1. Save our working copy (with our changes)
#   2. Restore the git HEAD version (which includes other agents' commits)
#   3. Diff our changes against the base we started from
#   4. Apply our additions on top of the fresh HEAD
#
# This handles the common case: both agents APPEND to the same file.
# For conflicting edits to the same line (rare), the script warns and
# keeps both versions.

set -euo pipefail

# Shared state files — paths relative to repo root
SHARED_FILES=(
    "docs/_internal/research/REGISTRY.md"
    "docs/_internal/TODO.md"
    "docs/_internal/ROADMAP.md"
    "docs/_internal/MANIFEST.md"
    ".lattice/decisions.log"
)

refresh_count=0
skip_count=0

for file in "${SHARED_FILES[@]}"; do
    # Skip if file doesn't exist in working tree
    if [ ! -f "$file" ]; then
        continue
    fi

    # Check if file has local modifications
    if git diff --quiet -- "$file" 2>/dev/null && git diff --cached --quiet -- "$file" 2>/dev/null; then
        skip_count=$((skip_count + 1))
        continue
    fi

    # File has local changes — merge with HEAD
    echo "MERGING: $file"

    # Save our version
    cp "$file" "$file.local"

    # Get the base version (what we started from — last commit we saw)
    # Use merge-base with HEAD to handle cases where we're behind
    git show HEAD:"$file" > "$file.head" 2>/dev/null || {
        # File doesn't exist in HEAD (new file) — keep our version
        echo "  NEW FILE — keeping local version"
        rm -f "$file.head" "$file.local"
        continue
    }

    # Check if HEAD version differs from what's on disk
    # (i.e., another agent committed changes to this file)
    if diff -q "$file.head" "$file.local" > /dev/null 2>&1; then
        # No difference — our version IS the HEAD version (no conflict)
        echo "  NO REMOTE CHANGES — keeping local version"
        rm -f "$file.head" "$file.local"
        skip_count=$((skip_count + 1))
        continue
    fi

    # HEAD differs from our version — need to merge
    # Strategy: find lines we added (in local but not in HEAD) and append to HEAD
    # This works for append-oriented files (TODO.md, REGISTRY.md, decisions.log)

    # Get the common ancestor (our original base)
    # For simplicity, use the last committed version of this file as base
    git show HEAD:"$file" > "$file.base" 2>/dev/null || cp "$file.head" "$file.base"

    # Try git merge-file (3-way merge)
    # merge-file modifies the first argument in place
    cp "$file.head" "$file.merged"
    if git merge-file "$file.merged" "$file.base" "$file.local" 2>/dev/null; then
        # Clean merge — no conflicts
        echo "  MERGED CLEANLY"
        cp "$file.merged" "$file"
    else
        # Conflict markers present — for shared state files, keep both
        # (conflict markers in REGISTRY.md/TODO.md are better than lost data)
        echo "  MERGE CONFLICT — keeping both versions (check for conflict markers)"
        cp "$file.merged" "$file"
    fi

    rm -f "$file.local" "$file.head" "$file.base" "$file.merged"
    refresh_count=$((refresh_count + 1))
done

echo ""
echo "SHARED STATE MERGE: $refresh_count files merged, $skip_count unchanged"
