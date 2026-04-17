#!/usr/bin/env bash
# Update @playwright/mcp to the latest version (global install + .mcp.json pin).
# Run quarterly or whenever you want to check for updates.
# Usage: bash scripts/update-playwright-mcp.sh

set -euo pipefail

MCP_JSON="C:/pg/pcc/.mcp.json"
PKG="@playwright/mcp"

current=$(npm list -g "$PKG" --depth=0 2>/dev/null | grep "$PKG" | sed 's/.*@//' || echo "none")
latest=$(npm view "$PKG" version 2>/dev/null)

echo "Current: $current"
echo "Latest:  $latest"

if [ "$current" = "$latest" ]; then
  echo "Already up to date."
  exit 0
fi

echo "Updating $PKG $current -> $latest ..."
npm install -g "$PKG@$latest"

# Update pinned version in .mcp.json
if [ -f "$MCP_JSON" ]; then
  sed -i "s|$PKG@[0-9][0-9.]*|$PKG@$latest|g" "$MCP_JSON"
  echo "Updated $MCP_JSON to pin $latest"
else
  echo "WARNING: $MCP_JSON not found -- update the version pin manually."
fi

echo "Done. Restart Claude Code to pick up the new MCP server version."
