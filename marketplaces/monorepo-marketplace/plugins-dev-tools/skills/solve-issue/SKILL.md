---
name: solve-issue
description: Take a GitHub issue URL and deliver an opened PR. Orchestrates planning, implementation, and shipping. Use when the user says "solve issue", "solve this issue", or provides an issue URL to work on.
argument-hint: "<issue-url-or-number>"
allowed-tools: Bash(git *), Read, Agent, mcp__plugin_plugins-dev-tools_dev-tools__issue_fetch, mcp__plugin_plugins-dev-tools_dev-tools__plan_read, mcp__plugin_plugins-dev-tools_dev-tools__plan_write, Skill
---

# Solve Issue

Automate the full workflow from GitHub issue to opened pull request: fetch the issue, explore the codebase, write a plan, implement each task with incremental commits, and ship via the existing ship-it pipeline.

## Arguments

| Position | Argument            | Required | Description                                         |
|----------|---------------------|----------|-----------------------------------------------------|
| 1        | issue-url-or-number | Yes      | GitHub issue URL, `#N`, or plain number              |

## Constraints

- Only use the tools listed in `allowed-tools`.
- **SEQUENTIAL PHASES**: Plan must complete before implementation begins. Implementation must complete before shipping begins. Do not skip phases.
- Do not force-push.
- Do not modify files outside of the Agent tool — all code changes happen inside the implement-agent.
- Use `pnpm` for any package manager operations — never `npm` or `npx`.

## Workflow

### 1. Parse and Validate

Extract the issue reference from `$ARGUMENTS`. Call `issue_fetch` with the reference to validate the issue exists.

**Abort if:**
- `$ARGUMENTS` is empty — "Usage: /solve-issue <issue-url-or-number>"
- `issue_fetch` fails — "Issue not found: <reference>"
- Issue state is `CLOSED` — "Issue is already closed."

Store the issue number as `$ISSUE_NUMBER`, the issue title as `$ISSUE_TITLE`, and the issue URL as `$ISSUE_URL`.

### 2. Resume Detection

Call `plan_read` with `$ISSUE_NUMBER` to check for an existing plan file.

If a plan exists, skip to the appropriate phase based on the plan status:

| Plan status      | Action                                              |
|------------------|-----------------------------------------------------|
| `planning`       | Re-run plan-agent (step 4) — planning is idempotent |
| `implementing`   | Skip to step 5 — implement-agent resumes from `[x]` |
| `shipping`       | Skip to step 6 — re-run ship-it (idempotent)        |
| `complete`       | Report done and stop — "Issue already resolved."     |

If no plan exists, continue to step 3.

### 3. Branch Setup

Check the current branch with `git branch --show-current`.

If on `main` or `master`, create and switch to a feature branch:

```shell
git checkout -b feat/gh-$ISSUE_NUMBER-$SLUG
```

Where `$SLUG` is a short kebab-case slug derived from the issue title (2-4 words, e.g. `add-user-endpoint`). This branch naming pattern ensures `extractIssueNumber` in the PR tool auto-appends `Closes #N`.

If already on a feature branch, stay on it.

### 4. Plan Phase

Spawn the `plan-agent` to explore the codebase and write a structured plan:

```
Agent(prompt: 'Plan the implementation for issue #$ISSUE_NUMBER: $ISSUE_TITLE. Issue URL: $ISSUE_URL. Branch: $CURRENT_BRANCH. Read the issue details via issue_fetch, explore the codebase, and write a plan via plan_write.', agent: 'plan-agent')
```

After the plan-agent returns, call `plan_read` to verify the plan was written successfully.

**Abort if:**
- Plan was not written — "Plan agent failed to produce a plan."
- Plan has zero tasks — "Plan has no tasks. Review the issue and try again."

> **BLOCKING — Do NOT proceed to step 5 until this step completes successfully.**

### 5. Implement Phase

Spawn the `implement-agent` to execute the plan:

```
Agent(prompt: 'Implement the plan for issue #$ISSUE_NUMBER. Read the plan via plan_read, implement each incomplete task, commit after each, and mark tasks [x] in the plan via plan_write.', agent: 'implement-agent')
```

After the implement-agent returns, call `plan_read` to verify progress.

**Abort if:**
- Not all tasks are complete — "Implementation incomplete: $COMPLETED/$TOTAL tasks done."

Update the plan status to `shipping` via `plan_write`.

> **BLOCKING — Do NOT proceed to step 6 until this step completes successfully.**

### 6. Ship Phase

Invoke the ship-it skill to run quality gate, update docs, push, and create a PR:

```
Skill(skill: 'plugins-dev-tools:ship-it')
```

After ship-it completes, update the plan status to `complete` via `plan_write`.

### 7. Report

Display a summary:

```
## Solve Issue Summary

| Step            | Status           |
|-----------------|------------------|
| Issue           | #$ISSUE_NUMBER — $ISSUE_TITLE |
| Branch          | $CURRENT_BRANCH  |
| Plan            | ✓ ($TOTAL tasks) |
| Implementation  | ✓ ($COMPLETED/$TOTAL tasks) |
| Ship            | ✓ / ✗           |
| PR              | <url>            |
```
