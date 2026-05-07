#!/bin/bash

# Rebuild and reinstall all claude-asana marketplace plugins.
#
# During plugin development, this script provides a fast way to pick up the
# latest source changes without incrementing package versions. It builds the
# plugin workspaces, then uninstalls and re-installs each enabled plugin so
# Claude Code loads the freshly-built artifacts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

CLAUDE="$(command -v claude 2>/dev/null || echo "$HOME/.local/bin/claude")"
if [ ! -x "$CLAUDE" ]; then
  echo -e "${RED}Error: claude CLI not found. Install it or add it to your PATH.${NC}"
  exit 1
fi

MARKETPLACE="claude-asana"
PLUGINS=()  # each entry: "plugin-name@marketplace|scope"

# ---------------------------------------------------------------------------
# 1. Parse enabled plugins from settings files
# ---------------------------------------------------------------------------
for pair in ".claude/settings.json|project" ".claude/settings.local.json|local"; do
  FILE="${pair%%|*}"
  SCOPE="${pair##*|}"
  FILEPATH="$PROJECT_ROOT/$FILE"
  [ -f "$FILEPATH" ] || continue

  while IFS= read -r key; do
    [[ "$key" == *"@$MARKETPLACE"* ]] && PLUGINS+=("${key}|${SCOPE}")
  done < <(jq -r '.enabledPlugins // {} | keys[]' "$FILEPATH")
done

if [ ${#PLUGINS[@]} -eq 0 ]; then
  echo -e "${YELLOW}No @${MARKETPLACE} plugins found in settings files.${NC}"
  exit 0
fi

# ---------------------------------------------------------------------------
# 2. Report discovered plugins
# ---------------------------------------------------------------------------
echo -e "\n${CYAN}Discovered plugins:${NC}"
printf "  %-45s %s\n" "PLUGIN" "SCOPE"
printf "  %-45s %s\n" "---------------------------------------------" "-------"
for entry in "${PLUGINS[@]}"; do
  PLUGIN="${entry%%|*}"
  SCOPE="${entry##*|}"
  printf "  %-45s %s\n" "$PLUGIN" "$SCOPE"
done
echo ""

# ---------------------------------------------------------------------------
# 3. Build plugin workspaces
# ---------------------------------------------------------------------------
echo -e "${CYAN}Building plugin workspaces...${NC}"
(cd "$PROJECT_ROOT" && pnpm --filter './marketplaces/plugins-*' build)
echo -e "${GREEN}Build complete.${NC}\n"

# ---------------------------------------------------------------------------
# 4. Uninstall each plugin
# ---------------------------------------------------------------------------
echo -e "${CYAN}Uninstalling plugins...${NC}"
for entry in "${PLUGINS[@]}"; do
  PLUGIN="${entry%%|*}"
  SCOPE="${entry##*|}"
  echo -e "  Uninstalling ${YELLOW}${PLUGIN}${NC} (${SCOPE})..."

  # `claude plugin uninstall` tracks installations in its own internal registry,
  # separate from settings.json. Plugins enabled via a committed settings.json
  # (e.g. in a fresh clone or new worktree) won't appear in that registry, so
  # uninstall reports "is not installed". This is safe to skip — the subsequent
  # install step will register the plugin correctly regardless.
  OUTPUT=$("$CLAUDE" plugin uninstall "$PLUGIN" -s "$SCOPE" 2>&1) || {
    if [[ "$OUTPUT" == *"is not installed"* ]] || [[ "$OUTPUT" == *"not found in installed plugins"* ]]; then
      echo -e "  ${YELLOW}Skipped${NC} (not yet registered in ${SCOPE} scope)"
    else
      echo -e "${RED}Error: failed to uninstall ${PLUGIN} (${SCOPE}). Aborting.${NC}"
      echo "$OUTPUT"
      exit 1
    fi
  }
done
echo -e "${GREEN}All plugins uninstalled.${NC}\n"

# ---------------------------------------------------------------------------
# 5. Install each plugin
# ---------------------------------------------------------------------------
echo -e "${CYAN}Installing plugins...${NC}"
for entry in "${PLUGINS[@]}"; do
  PLUGIN="${entry%%|*}"
  SCOPE="${entry##*|}"
  echo -e "  Installing ${YELLOW}${PLUGIN}${NC} (${SCOPE})..."
  if ! OUTPUT=$("$CLAUDE" plugin install "$PLUGIN" -s "$SCOPE" 2>&1); then
    echo -e "${RED}Error: failed to install ${PLUGIN} (${SCOPE}). Aborting.${NC}"
    echo "$OUTPUT"
    exit 1
  fi
  echo -e "  ${GREEN}Installed${NC} ${YELLOW}${PLUGIN}${NC} (${SCOPE})"
done
echo -e "${GREEN}All plugins installed.${NC}\n"

# ---------------------------------------------------------------------------
# 6. Final report
# ---------------------------------------------------------------------------
echo -e "${GREEN}Refreshed plugins:${NC}"
printf "  %-45s %s\n" "PLUGIN" "SCOPE"
printf "  %-45s %s\n" "---------------------------------------------" "-------"
for entry in "${PLUGINS[@]}"; do
  PLUGIN="${entry%%|*}"
  SCOPE="${entry##*|}"
  printf "  %-45s %s\n" "$PLUGIN" "$SCOPE"
done
echo ""
