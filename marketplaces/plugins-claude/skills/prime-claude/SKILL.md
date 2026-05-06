---
name: prime-claude
description: Load Claude Code reference documentation into context for a task (e.g. creating skills, hooks, sub-agents, etc.)
argument-hint: "[load | doc-names...]"
disable-model-invocation: true
allowed-tools: Bash
---

# Reference Documentation

!`CLAUDE_PLUGIN_DATA=${CLAUDE_PLUGIN_DATA} pnpm --filter @marketplace/plugins-claude exec tsx src/skills/prime-claude/index.ts $ARGUMENTS`

# Instructions

If the output above contains "ERROR:", relay the error message to the user exactly as shown and stop. Do not proceed with any other work.

If the first argument was `load`, confirm which documents were fetched and that they are now available for future `/prime-claude` invocations.

Otherwise, you have been primed with the requested Claude Code reference documentation. Acknowledge which documents were loaded and ask the user what they'd like to build or work on.
