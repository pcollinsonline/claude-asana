#!/bin/bash

# Launch Claude Code in dev mode with plugins loaded directly from disk.
#
# Bypasses the global plugin cache (~/.claude/plugins/cache/) by using
# --plugin-dir flags, so each git worktree loads its own build output.
# After rebuilding plugins, run /reload-plugins inside the session to
# pick up changes without restarting.
#
# Usage: scripts/claude-dev.sh [claude args...]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

MARKETPLACE_NAME="claude-asana"
MARKETPLACE_DIR="monorepo-marketplace"

# ---------------------------------------------------------------------------
# 1. Discover claude-asana plugins from settings files
# ---------------------------------------------------------------------------
PLUGINS=()  # each entry: "plugin-name@marketplace|scope"

for pair in ".claude/settings.json|project" ".claude/settings.local.json|local"; do
  FILE="${pair%%|*}"
  SCOPE="${pair##*|}"
  FILEPATH="$PROJECT_ROOT/$FILE"
  [ -f "$FILEPATH" ] || continue

  while IFS= read -r key; do
    [[ "$key" == *"@$MARKETPLACE_NAME"* ]] && PLUGINS+=("${key}|${SCOPE}")
  done < <(jq -r '.enabledPlugins // {} | keys[]' "$FILEPATH")
done

if [ ${#PLUGINS[@]} -eq 0 ]; then
  echo -e "${YELLOW}No @${MARKETPLACE_NAME} plugins found in settings files.${NC}"
  exit 0
fi

echo -e "\n${CYAN}Discovered plugins:${NC}"
for entry in "${PLUGINS[@]}"; do
  PLUGIN="${entry%%|*}"
  echo -e "  ${PLUGIN}"
done
echo ""

# ---------------------------------------------------------------------------
# 2. Uninstall marketplace plugins (so --plugin-dir takes full control)
# ---------------------------------------------------------------------------
echo -e "${CYAN}Uninstalling marketplace plugins...${NC}"
for entry in "${PLUGINS[@]}"; do
  PLUGIN="${entry%%|*}"
  SCOPE="${entry##*|}"

  OUTPUT=$(claude plugin uninstall "$PLUGIN" -s "$SCOPE" 2>&1) || {
    if [[ "$OUTPUT" == *"is not installed"* ]]; then
      echo -e "  ${YELLOW}Skipped${NC} ${PLUGIN} (not registered)"
    else
      echo -e "${RED}Error: failed to uninstall ${PLUGIN} (${SCOPE}). Aborting.${NC}"
      echo "$OUTPUT"
      exit 1
    fi
  }
done
echo -e "${GREEN}Done.${NC}\n"

# ---------------------------------------------------------------------------
# 3. Build plugin workspaces
# ---------------------------------------------------------------------------
echo -e "${CYAN}Building plugin workspaces...${NC}"
(cd "$PROJECT_ROOT" && pnpm --filter './marketplaces/plugins-*' build)
echo -e "${GREEN}Build complete.${NC}\n"

# ---------------------------------------------------------------------------
# 4. Resolve --plugin-dir paths and launch claude
# ---------------------------------------------------------------------------
PLUGIN_DIR_ARGS=()
for entry in "${PLUGINS[@]}"; do
  PLUGIN="${entry%%|*}"
  # Extract plugin name: "plugins-dev-tools@claude-asana" -> "plugins-dev-tools"
  NAME="${PLUGIN%%@*}"
  DIR="$PROJECT_ROOT/marketplaces/$MARKETPLACE_DIR/$NAME"

  if [ ! -d "$DIR" ]; then
    echo -e "${RED}Error: built plugin directory not found: ${DIR}${NC}"
    exit 1
  fi

  PLUGIN_DIR_ARGS+=("--plugin-dir" "$DIR")
done

echo -e "${CYAN}Launching claude with local plugins:${NC}"
for entry in "${PLUGINS[@]}"; do
  PLUGIN="${entry%%|*}"
  NAME="${PLUGIN%%@*}"
  echo -e "  ${GREEN}${NAME}${NC} → marketplaces/${MARKETPLACE_DIR}/${NAME}"
done
echo ""

exec claude "${PLUGIN_DIR_ARGS[@]}" "$@"
