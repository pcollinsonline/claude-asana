---
name: update-plugins-doc
description: Update marketplaces/docs/plugins.md when plugin source files under marketplaces/ have changed. Use when plugin skills, agents, hooks, or conventions change.
allowed-tools: mcp__plugin_plugins-dev-tools_dev-tools__plugins_doc_prepare, Edit, Read
---

# Update Plugins Doc

Update `marketplaces/docs/plugins.md` to accurately reflect the current plugin source tree under `marketplaces/`.

## Constraints

- Only use the tools listed in `allowed-tools`. No Bash.
- Do not rewrite philosophical or design sections — only update sections that reference concrete plugins, skills, agents, hooks, or build patterns.
- Preserve the existing document structure, tone, and writing style.
- Do not add or remove top-level sections without good reason.

## Workflow

### 1. Check Freshness

Call `plugins_doc_prepare` (no arguments).

The tool returns a `status`:

- **`up_to_date`** → report "marketplaces/docs/plugins.md is up to date — skipping" and **stop**.
- **`no_history`** → proceed to step 2 (read all source files).
- **`stale`** → proceed to step 2 using the returned `changedFiles`.

### 2. Read Changed Source Files

Use `Read` to read the changed source files from step 1.

- Use the `changedFiles[].path` values (relative to repo root) as file paths.
- Skip files with `fileType: "other"` — they are not relevant to the doc.
- Skip test files (paths ending in `.test.ts`).
- For `no_history` status, read all source files under `marketplaces/` (skills, agents, hooks, MCP tools, build configs, package.json files) and `packages/plugins-base/src/index.ts`.

### 3. Read the Doc

Use `Read` to read `marketplaces/docs/plugins.md` in full.

### 4. Analyze and Draft Updates

Compare the source file contents against the doc. For each section that is out of date:

1. Identify what specifically changed (e.g. a skill's `allowed-tools` switched from Bash to MCP tools, a new agent was added, a hook was removed).
2. Draft the updated section content, preserving the existing style and structure.

### 5. Apply Updates

Use `Edit` to apply each change to `marketplaces/docs/plugins.md` (one Edit call per section change, using old_string/new_string).

### 6. Report

List which sections were updated, or confirm that no content changes were needed beyond the freshness check.
