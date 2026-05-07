---
name: document-skill
description: Generate detailed technical documentation for a Claude Code skill. Use when the user asks to "document a skill", "document skill", "write docs for a skill", "create skill documentation", or references documenting anything in a .claude/skills/ directory.
argument-hint: "[skill-name]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep
---

# Skill Documentation Generator

Generate a comprehensive technical reference document for a single Claude Code skill. The output is a Markdown file with Mermaid diagrams, suitable for rendering on GitHub.

## Why this skill exists

Skills combine instruction files with tool integrations and supporting scripts, but the SKILL.md is written for Claude — not for humans trying to understand the architecture. This skill produces developer-facing documentation that explains what the skill does, how it executes, and the interfaces it touches.

## Workflow

### 1. Discover skill sources

Starting from `$ARGUMENTS` (the skill name), locate and read all relevant source files:

**Always read:**
- The skill's `SKILL.md` at `.claude/skills/$0/SKILL.md`
- Every file in the skill directory (supporting markdown, scripts, assets)

**Read if the skill uses MCP tools** (check `allowed-tools` in the frontmatter for `mcp__` prefixes):
- Start from `.mcp.json` at the plugin root — it maps server names to entry points and is the canonical source for which MCP servers exist
- Read the MCP server entry point (typically `src/mcp/server.ts`) to find which tool modules it imports
- Read each tool implementation file (typically under `src/mcp/tools/`) — these contain the Zod schemas, handler functions, and TypeScript interfaces that define the tool contracts
- Follow imports one level deep for shared types or utility modules the handlers depend on

**Read if the skill declares hooks** (check `hooks:` array in the frontmatter):
- Skill-scoped hook entry points at `src/skills/<skill-name>/hooks/<event-name>/index.ts`
- Plugin-level hooks at `src/hooks/<event-name>/index.ts` if the skill's behavior depends on them

If any expected file is missing, note it in the doc rather than guessing at its contents.

### 2. Discover existing docs

Check whether a `docs/` directory already exists at the project root. If it does, read any existing skill docs to match their structure and voice. Consistency across docs matters more than any single template.

### 3. Write the document

Create `docs/$0-skill.md` with the following sections. Adapt the depth of each section to the skill's complexity — a simple skill with no tools needs less than a skill orchestrating multiple MCP calls.

---

#### Section 1: Overview

Two to three sentences: what the skill does and how (its general approach). Name the tools or workflow pattern but nothing more — no hook behavior, tool restrictions, validation rules, or file exclusions. Those belong in later sections.

Example of a good overview:
> The `commit` skill stages and commits changes using conventional commits format. It uses three MCP tools — `commit_prepare`, `commit_diff`, and `commit_execute` — in a prepare-analyze-execute workflow.

Example of a bad overview (front-loads details covered elsewhere):
> The `commit` skill stages and commits changes using conventional commits format, restricted to its MCP tools only (no Bash, no Read). It never stages `.env` files. A skill-scoped `PreToolUse` hook auto-approves the plugin's MCP tools so the workflow runs without user prompts.

#### Section 2: Workflow diagram

A Mermaid `sequenceDiagram` showing the full execution flow from invocation to completion.

Include:
- Every tool call or script execution, in order
- Decision points (conditionals, optional steps, error branches)
- Retry or fallback paths if the skill defines them
- Data flowing between steps (what each call returns that the next step uses)
- Hook interactions if the skill declares them (e.g., a PreToolUse hook that auto-approves MCP tools). Show the hook firing at **every** tool call it applies to, not just one representative instance — a reader should see the full picture of which calls are auto-approved vs. prompted.

Participants should be labeled clearly — use the skill name, tool names, and external services (e.g., `git`) as actors.

#### Section 3: Tool interface reference (if applicable)

**Only include this section if the skill calls MCP tools or executes scripts with structured input/output.**

For each tool, document:
- **Purpose**: one sentence
- **Input parameters**: name, type, whether required, and a brief description. Derive these from the actual Zod schemas, TypeScript interfaces, or function signatures — not from the SKILL.md summary.
- **Success response**: the shape of the returned data, with field descriptions
- **Error response**: the shape of error returns, including any `stage` or error-code conventions. Describe the error *shape* (fields, stage values) but do not re-list validation rules here — reference Section 4 (Behavioral Rules) instead.
- **Input/output tables**: use markdown tables with columns: Field, Type, Required, Description. Do not add mermaid class diagrams — the tables are the canonical schema representation.

If the skill only uses built-in Claude Code tools (Read, Grep, Bash, etc.), skip this section entirely.

#### Section 4: Behavioral rules (if applicable)

If the skill implements validation, inference, filtering, or other deterministic logic that shapes its behavior, document each as a standalone subsection. These are rules the skill enforces — not tool I/O schemas (Section 3) or output format examples (Section 5).

Common patterns to look for:
- **Validation rules** — constraints checked before an action (e.g., header format, allowed values, length limits). List every rule with the exact check (regex, comparison, allowed set).
- **Inference logic** — deterministic decisions the skill makes from input data (e.g., scope inference from file paths). Use a condition → result table.
- **Filtering rules** — files, inputs, or outputs the skill always excludes or includes.

Derive these from the implementation (function bodies, constants, config objects) — not from the SKILL.md prose. Include the actual values (regex patterns, allowed type lists, numeric limits).

#### Section 5: Output format (if applicable)

If the skill produces structured output (commit messages, reports, config files), document the format with examples derived from the skill's instructions. Do not restate validation rules or constraints already documented in Section 4 — show the format through examples and reference the relevant section for rules.

#### Section 6: Reference

Link back to the source files:
- Path to the SKILL.md
- Paths to supporting files (reference docs, scripts, templates)
- Paths to MCP tool implementations (if applicable)

---

### 4. Update project README

If the project's root `README.md` does not already link to the `docs/` directory, add a "Documentation" section (or a link within an existing section) pointing to the new doc. Keep the edit minimal — add the link, don't restructure the README.

### 5. Report

Summarize what was created:
- The path to the new documentation file
- Which source files were read
- Any files that were expected but missing
- The README edit (if made)

## Mermaid guidelines

- Use `sequenceDiagram` for workflow flows (not `flowchart` — sequences better represent the temporal ordering of tool calls)
- Keep participant names short but unambiguous
- Use `alt`/`else` blocks for conditional paths
- Use `opt` blocks for optional steps
- Use `Note over` for important context or constraints
- Test that diagrams render in GitHub-flavored Markdown (no exotic Mermaid syntax — avoid `par` blocks, custom themes, or HTML in labels)
