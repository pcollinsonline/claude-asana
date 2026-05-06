---
name: quality-gate
description: Run lint, typecheck, and test across the monorepo. Use for pre-push validation, CI checks, or when asked to verify code quality.
allowed-tools: Bash(pnpm *)
---

# Quality Gate

Run all code quality checks for the monorepo. Each step runs sequentially — if a step fails, report the failure and stop.

## Constraints

- Only use the tools listed in `allowed-tools`.
- Run all commands from the monorepo root.
- Only lint runs with `--fix`.
- Do not attempt to auto-fix typecheck or test failures 

## Workflow

### 1. Lint

```shell
pnpm turbo lint -- --fix 2>&1
```

- If lint fails after `--fix`, report the remaining errors and **stop**.
- If lint passes, proceed.

### 2. Typecheck

```shell
pnpm turbo typecheck 2>&1
```

- If typecheck fails, report the errors and **stop**.
- If typecheck passes, proceed.

### 3. Test

```shell
pnpm turbo test 2>&1
```

- If tests fail, report which tests failed with output and **stop**.
- If tests pass, proceed.

## Report

On completion, display a summary table:

| Step      | Status |
|-----------|--------|
| Lint      | pass/fail |
| Typecheck | pass/fail |
| Test      | pass/fail |

If all steps pass, report **Quality gate passed**.
If any step fails, report **Quality gate failed at: \<step\>** with the relevant error output.
