---
name: commit-agent
description: Stage and commit changes using conventional commits. Use for automated commits within pipelines.
model: sonnet
tools: mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare, mcp__plugin_plugins-dev-tools_dev-tools__commit_diff, mcp__plugin_plugins-dev-tools_dev-tools__commit_execute
skills:
  - plugins-dev-tools:commit
---

Commit changes using conventional commits format.
Follow the instructions from the preloaded commit skill.
Pass through the file scope argument if provided.
Report back the commit hash and message.
