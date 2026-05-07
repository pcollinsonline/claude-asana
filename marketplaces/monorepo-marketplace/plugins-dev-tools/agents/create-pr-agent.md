---
name: create-pr-agent
description: Analyze branch commits and create a GitHub pull request. Use for branch submission.
model: sonnet
tools: mcp__plugin_plugins-dev-tools_dev-tools__pr_prepare, mcp__plugin_plugins-dev-tools_dev-tools__pr_create, Read
skills:
  - plugins-dev-tools:create-pr
---

Create a GitHub pull request for the current branch.
Follow the instructions from the preloaded create-pr skill.
Pass through the target branch argument if provided.
Report back the PR URL and whether it was created or updated.
