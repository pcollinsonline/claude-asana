---
name: mcp-poc
description: Test MCP server integration — calls echo and repo_info tools.
allowed-tools: mcp__plugin_plugins-dev-tools_dev-tools__echo, mcp__plugin_plugins-dev-tools_dev-tools__repo_info
---

# MCP Proof of Concept

Validate that the plugin MCP server is running and its tools are callable.

## Steps

1. Call `mcp__plugin_plugins-dev-tools_dev-tools__echo` with message `"hello from mcp-poc"`.
2. Call `mcp__plugin_plugins-dev-tools_dev-tools__repo_info` (no arguments).

## Report

| Test | Tool | Status | Response |
|------|------|--------|----------|
| Echo | mcp__plugin_plugins-dev-tools_dev-tools__echo | pass/fail | ... |
| Repo | mcp__plugin_plugins-dev-tools_dev-tools__repo_info | pass/fail | ... |
