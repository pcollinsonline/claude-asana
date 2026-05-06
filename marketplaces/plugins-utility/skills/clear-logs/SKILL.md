---
name: clear-logs
description: Clear hook log files from .ai/plugins-utility/logs/. Pass "archive" to zip logs before deleting.
argument-hint: "[archive]"
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

# Clear Logs

Delete all hook log files from `.ai/plugins-utility/logs/`.

## Usage

- `/clear-logs` — delete all log files immediately
- `/clear-logs archive` — create a timestamped zip archive in `.ai/plugins-utility/archives/` before deleting

## Workflow

!`node src/skills/clear-logs/clear-logs.ts $ARGUMENTS`
