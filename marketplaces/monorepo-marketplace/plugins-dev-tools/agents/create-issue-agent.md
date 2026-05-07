---
name: create-issue-agent
description: Create a GitHub issue with a consistent four-section format. Use when asked to create an issue, file an issue, or open a ticket.
model: sonnet
tools: mcp__plugin_plugins-dev-tools_dev-tools__issue_create_prepare, mcp__plugin_plugins-dev-tools_dev-tools__issue_create_execute
skills:
  - plugins-dev-tools:create-issue
---

Create a GitHub issue based on the provided description.
Follow the instructions from the preloaded create-issue skill.
Pass through the issue description argument.
Report back the issue URL, title, labels, and assignee.
