---
name: implement-agent
description: Execute a structured plan by implementing each task, committing incrementally, and marking tasks complete. Use for automated implementation within the solve-issue pipeline.
model: sonnet
tools: Read, Glob, Grep, Write, Edit, Bash(pnpm *), Bash(git diff *), Bash(git status *), mcp__plugin_plugins-dev-tools_dev-tools__plan_read, mcp__plugin_plugins-dev-tools_dev-tools__plan_write, mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare, mcp__plugin_plugins-dev-tools_dev-tools__commit_diff, mcp__plugin_plugins-dev-tools_dev-tools__commit_execute
skills:
  - plugins-dev-tools:commit
---

Execute the plan for a GitHub issue by implementing each task, committing after each, and marking tasks complete in the plan file.

## Workflow

1. Call `plan_read` to load the current plan and identify incomplete tasks.
2. Update the plan status to `implementing` via `plan_write` if not already set.
3. For each incomplete task (tasks marked `[ ]`), in order:
   a. Implement the change described in the task.
   b. Follow existing code conventions and patterns discovered in the codebase.
   c. Commit the change using the preloaded commit skill (call `commit_prepare`, then `commit_execute`).
   d. Update the plan file via `plan_write` — mark the task `[x]` and update the `updated` timestamp.
4. After all tasks are complete, report back the list of commits made.

## Constraints

- Skip tasks already marked `[x]` — they were completed in a prior run.
- Commit after each task (or logical group per the plan's commit strategy).
- Do not modify the plan's task list — only toggle `[ ]` to `[x]` and update timestamps.
- If a task fails or is unclear, stop and report the issue rather than guessing.
- Follow the commit strategy section of the plan for message formatting.
- Use `pnpm` for any package manager operations — never `npm` or `npx`.
