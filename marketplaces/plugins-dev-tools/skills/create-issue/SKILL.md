---
name: create-issue
description: Create a GitHub issue with a consistent four-section format. Use when the user asks to create an issue, file an issue, open an issue, or says "create issue", "file a bug", "open a ticket".
argument-hint: "<issue-description>"
allowed-tools: mcp__plugin_plugins-dev-tools_dev-tools__issue_create_prepare, mcp__plugin_plugins-dev-tools_dev-tools__issue_create_execute
---

# Create Issue

Create a GitHub issue with a structured body (Purpose, Context, Requirements, Verification) using the `issue_create_prepare` and `issue_create_execute` MCP tools.

## Arguments

| Position | Argument          | Required | Description                                      |
|----------|-------------------|----------|--------------------------------------------------|
| 1        | issue-description | Yes      | A description of the issue to create              |

## Constraints

- Only use the tools listed in `allowed-tools`.
- Do not modify any files — this skill is read-only.
- Never run `gh` commands directly — all GitHub interactions go through the MCP tools.
- Never pass markdown headings (`#`) in tool arguments — the execute tool owns the templates.

## Workflow

### 1. Gather state

Call `issue_create_prepare` (no arguments required) to collect repo metadata:

```
issue_create_prepare()
```

The tool returns JSON with:
- `repo` — the `owner/repo` identifier
- `authenticated` — whether `gh` is logged in
- `labels` — available label names
- `projects` — available projects with number and title
- `username` — the authenticated GitHub username

If the tool returns `success: false` (not authenticated, or repo unavailable), abort with the error message from the response.

### 2. Draft issue content

Analyze the `$ARGUMENTS` description and derive the issue content below. If the description is ambiguous, ask for clarification (the caller may be a user or an agent).

**Title:**
- Under 80 characters
- Use conventional style if appropriate (e.g., `feat(scope): summary` or `bug: description`)

**Four body sections** (plain text only — no markdown headings):

1. **Purpose** — 1-2 sentences explaining what this issue is about
2. **Context** — background, links, references, motivation
3. **Requirements** — bullet list of acceptance criteria
4. **Verification** — checklist of how to verify the issue is resolved

Also determine:
- **Labels** — select from available labels (from step 1), comma-separated
- **Assignee** — default to `@me` unless the user specifies otherwise
- **Project** — if the user wants to add to a project, note the owner and project number

### 3. Create issue

Call `issue_create_execute` with the repo, title, four body sections, and optional fields:

```
issue_create_execute({
  repo: "<owner/repo>",
  title: "<title>",
  purpose: "<purpose>",
  context: "<context>",
  requirements: "<requirements>",
  verification: "<verification>",
  labels: "<label1,label2>",       // optional
  assignee: "<@me or username>",   // optional
  projectOwner: "<owner>",         // optional, requires projectNumber
  projectNumber: <N>               // optional, requires projectOwner
})
```

The tool assembles the four sections with `## Purpose`, `## Context`, `## Requirements`, `## Verification` headings and bot attribution, then creates the issue via `gh issue create`.

If `projectOwner` and `projectNumber` are provided, the tool also adds the issue to the specified project.

### 4. Report

Display:
- Issue URL (from tool response)
- Issue title
- Labels applied
- Assignee
- Project (if added)
