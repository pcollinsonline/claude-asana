---
name: ship-it
description: Push it, ship it — update docs, run quality checks, push branch, and open a PR. Use when the user says "ship it", "push it", "ship", "push", or asks to finalize/submit their branch.
argument-hint: "[target-branch]"
allowed-tools: Bash(git status *), Bash(git push *), Read, Agent, mcp__plugin_plugins-dev-tools_dev-tools__ship_preflight
---

# Ship It

Automate the end-of-development workflow: update documentation, run quality checks, push the branch, and open a pull request.

## Arguments

| Position | Argument      | Required | Default | Description                        |
|----------|---------------|----------|---------|------------------------------------|
| 1        | target-branch | No       | `main`  | The base branch for the PR         |

## Constraints

- Only use the tools listed in `allowed-tools`.
- Do not skip any pipeline step unless instructed by the user.
- **SEQUENTIAL GATE**: Do NOT start steps 3-7 until step 2 (Quality Gate) has completed and passed. Wait for the quality-gate-agent to return a passing result before invoking any other agent.
- Steps 3 and 4 MAY run in parallel with each other, but only after step 2 passes.
- Stop the pipeline immediately if the quality gate fails.
- Do not force-push.

## Workflow

### 1. Preflight Checks

Call `ship_preflight` with the target branch:

```
ship_preflight({ targetBranch: "$TARGET_BRANCH" })
```

Where `$TARGET_BRANCH` is from `$ARGUMENTS` (default: `main`).

The tool checks in sequence: GitHub auth, current branch (not main/master), uncommitted changes, fetch target branch, and divergence detection.

**Abort if** the tool returns `success: false` — display the `error` field from the response.

**Warn if** the response includes a `warning` field (e.g., uncommitted changes) — display it but continue.

Store `branch` from the response as `$CURRENT_BRANCH` and `targetBranch` as `$TARGET_BRANCH`.

### 2. Quality Gate

Invoke the `quality-gate-agent` to run lint, typecheck, and test:

```
Agent(prompt: 'Run all quality checks', agent: 'quality-gate-agent')
```

**If the quality gate fails, stop the pipeline.** Report the failure and do not proceed to documentation updates, push, or PR creation.

> **BLOCKING — Do NOT proceed until this step completes.**
> Wait for the quality-gate-agent to return its result. Do NOT launch update-plugins-doc-agent, update-docs-agent, or any subsequent agent call until the quality gate passes. Steps 3-7 depend on this result.

### Documentation Updates (steps 3-4) — run only after step 2 passes

Steps 3 and 4 MAY run in parallel with each other.

#### 3. Update Plugin Documentation

Invoke the `update-plugins-doc-agent` to check and update `marketplaces/docs/plugins.md`:

```
Agent(prompt: 'Check if marketplaces/docs/plugins.md needs updating and update it if so', agent: 'update-plugins-doc-agent')
```

#### 4. Update README Documentation

Invoke the `update-docs-agent` to update all READMEs:

```
Agent(prompt: 'Update all READMEs in the monorepo', agent: 'update-docs-agent')
```

### 5. Commit Documentation Changes

Check `git status` for any changes made by the documentation updates.

If there are changes:
- Invoke the `commit-agent` to commit the changed files:
  ```
  Agent(prompt: 'Commit the documentation changes: <changed-files>', agent: 'commit-agent', args: '<changed-files>')
  ```

If there are no changes, skip this step.

### 6. Push Branch

Push the current branch to the remote:

```shell
git push -u origin $CURRENT_BRANCH
```

If push fails, report the error and stop.

### 7. Create or Update Pull Request

Invoke the `create-pr-agent` with the target branch. The create-pr skill automatically handles both creating a new PR and updating an existing one:

```
Agent(prompt: 'Create or update a PR targeting $TARGET_BRANCH', agent: 'create-pr-agent', args: '$TARGET_BRANCH')
```

### 8. Report

Display a summary of the pipeline:

```
## Ship It Summary

| Step                | Status            |
|---------------------|-------------------|
| Quality Gate        | ✓ / ✗             |
| Update Plugin Docs  | ✓ / skipped       |
| Update READMEs      | ✓ / ✗             |
| Commit Docs         | ✓ / skipped       |
| Push                | ✓ / ✗             |
| PR                  | ✓ created / ✓ updated / ✗ |

Branch: $CURRENT_BRANCH → $TARGET_BRANCH
PR: <url>
```
