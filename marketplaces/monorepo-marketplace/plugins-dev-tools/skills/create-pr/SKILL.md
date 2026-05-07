---
name: create-pr
description: Analyze branch commits and create or update a GitHub pull request. Use when ready to open a PR for the current branch, or to update the description of an existing PR after pushing new commits.
argument-hint: "[target-branch]"
allowed-tools: mcp__plugin_plugins-dev-tools_dev-tools__pr_prepare, mcp__plugin_plugins-dev-tools_dev-tools__pr_create, Read
---

# Create PR

Create or update a GitHub pull request for the current branch. If a PR already exists, the title and description are regenerated from the current commits and updated.

## Arguments

| Position | Argument      | Required | Default | Description                        |
|----------|---------------|----------|---------|------------------------------------|
| 1        | target-branch | No       | `main`  | The base branch for the PR         |

## Constraints

- Only use the tools listed in `allowed-tools`.
- Do not modify any files — this skill is read-only.
- Do not push the branch — assume it has already been pushed.

## Workflow

### 1. Prepare

Call `pr_prepare` with `targetBranch` parsed from `$ARGUMENTS` (default: `main`).

If `validation.valid` is `false`, abort and report the error from `validation.error`.

### 2. Read template

Use the `Read` tool to load the PR template:

```
Read: ${CLAUDE_PLUGIN_ROOT}/skills/create-pr/templates/default.md
```

### 3. Draft PR content

From the returned `commits` and `diffStat`, draft:

**Title:**
- Under 70 characters
- Derive from the branch name and commit themes
- Use conventional commit style if all commits share a type (e.g., `feat(scope): summary`)

**Summary** (bullet points only — no heading):
```
- Bullet points summarizing the changes from the commit history
```

**Test plan** (checklist only — no heading):
```
- [ ] Checklist items based on what changed
```

### 4. Create or update PR

Call `pr_create` with:
- `base` — the target branch
- `title` — the PR title
- `summary` — the bullet points from step 3
- `testPlan` — the checklist from step 3
- `template` — the raw template content from step 2

The tool handles template rendering (including `Closes #N` from the branch name), existing PR detection, and create-vs-update logic.

### 5. Report

Display:
- PR URL (from tool output)
- Action taken: `action` field ("created" or "updated")
- PR title
- Number of commits included (from `pr_prepare` response)
- Target branch
