---
name: prime-claude-status
description: Show status of loaded Claude Code reference documentation
argument-hint: "[check]"
disable-model-invocation: true
allowed-tools: Bash
---

# Documentation Status

!`CLAUDE_PLUGIN_DATA=${CLAUDE_PLUGIN_DATA} pnpm --filter @marketplace/plugins-claude exec tsx src/skills/prime-claude-status/index.ts $ARGUMENTS`

# Instructions

If the output above contains "ERROR:", relay the error message to the user exactly as shown and stop.

Otherwise, present the table output above to the user inside a fenced code block to preserve column alignment.
