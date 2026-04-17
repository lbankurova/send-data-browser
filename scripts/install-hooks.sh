#!/bin/bash
#
# Install git hooks from hooks/ into .git/hooks/.
# Uses symlinks on Unix, copies on Windows. Re-run after pulling updates.
#
# Usage:
#   bash scripts/install-hooks.sh                    # install in current repo
#   bash scripts/install-hooks.sh /path/to/project   # install in another repo
#

set -euo pipefail

TARGET_ROOT="${1:-.}"
TARGET_ROOT="$(cd "$TARGET_ROOT" && pwd)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LATTICE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Use project's own hooks/ if it exists, otherwise use lattice framework hooks/
if [ -d "$TARGET_ROOT/hooks" ]; then
    HOOKS_SOURCE="$TARGET_ROOT/hooks"
else
    HOOKS_SOURCE="$LATTICE_ROOT/hooks"
fi

GIT_DIR="$TARGET_ROOT/.git"
HOOKS_DIR="$GIT_DIR/hooks"

if [ ! -d "$GIT_DIR" ]; then
    echo "ERROR: $TARGET_ROOT is not a git repository."
    exit 1
fi

if [ ! -d "$HOOKS_SOURCE" ]; then
    echo "ERROR: No hooks/ directory found at $HOOKS_SOURCE or $LATTICE_ROOT/hooks"
    exit 1
fi

mkdir -p "$HOOKS_DIR"

INSTALLED=0

for HOOK_FILE in "$HOOKS_SOURCE"/*; do
    [ ! -f "$HOOK_FILE" ] && continue

    HOOK_NAME="$(basename "$HOOK_FILE")"

    # Skip non-hook files
    case "$HOOK_NAME" in
        *.json|*.md|*.txt|*.sample) continue ;;
    esac

    DEST="$HOOKS_DIR/$HOOK_NAME"

    # Back up existing non-managed hooks
    if [ -f "$DEST" ] && ! grep -q "# managed-by: install-hooks.sh" "$DEST" 2>/dev/null; then
        echo "  Backing up existing $HOOK_NAME -> $HOOK_NAME.bak"
        cp "$DEST" "$DEST.bak"
    fi

    # Copy with marker after shebang (works on all platforms)
    SHEBANG=$(head -1 "$HOOK_FILE")
    {
        echo "$SHEBANG"
        echo "# managed-by: install-hooks.sh -- re-run to update"
        echo "# source: $HOOK_FILE"
        tail -n +2 "$HOOK_FILE"
    } > "$DEST"
    chmod +x "$DEST"
    echo "  Installed: $HOOK_NAME (from $HOOKS_SOURCE)"
    INSTALLED=$((INSTALLED + 1))
done

echo ""
echo "Done. $INSTALLED hook(s) installed in $HOOKS_DIR"
echo "Source: $HOOKS_SOURCE"
