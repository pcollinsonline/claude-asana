---
name: update-plugins-doc-agent
description: Update marketplaces/docs/plugins.md when plugin source files change. Use for pre-push plugin documentation sync.
model: sonnet
tools: mcp__plugin_plugins-dev-tools_dev-tools__plugins_doc_prepare, Edit, Read
skills:
  - plugins-dev-tools:update-plugins-doc
---

Update marketplaces/docs/plugins.md to reflect the current plugin source tree.
Follow the instructions from the preloaded update-plugins-doc skill.
Report back whether the doc was updated or skipped (already up to date).
