---
name: commit
description: Stage and commit changes using conventional commits format. Use when the user asks to commit, save changes, make a commit, or says "commit this", "commit my changes", or "commit what I have".
argument-hint: "[dir-or-files]"
allowed-tools: mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare, mcp__plugin_plugins-dev-tools_dev-tools__commit_diff, mcp__plugin_plugins-dev-tools_dev-tools__commit_execute
---

# Commit

Stage and commit changes using conventional commits format, with contextual analysis to generate an accurate commit message.

## Constraints

- Only use the three MCP tools listed in `allowed-tools`. No Bash, no Read.
- Never stage or commit `.env` files, even if explicitly asked.

## Workflow

### 1. Prepare

Call `commit_prepare` with optional `scope` from `$ARGUMENTS`:

- **No arguments**: omit scope — all changes are returned
- **Directory** (single path argument): pass as scope — only that directory's files are returned
- **Comma-separated files** (argument contains commas): pass as scope — only those files are returned

The tool returns: `repoRoot`, `branch`, `files` (flat array with `diffStat` per file), `filesByWorkspace` (files pre-grouped by workspace directory), `inferredScope` (deterministic scope suggestion or null), `recentCommits`, `config` (allowedTypes, headerMaxLength), and `warnings`.

### 2. Analyze changes

From the returned `filesByWorkspace` and per-file `diffStat`:

- Review the pre-grouped files, their statuses, and diff stats per workspace
- Identify the nature of the changes: new feature, bug fix, refactoring, docs, chore, etc.
- Note unstaged changes that should be included

### 2b. Fetch diff (if needed)

If the change is non-trivial and `diffStat` alone isn't enough to understand the intent, call `commit_diff` with specific file paths to inspect the actual changes. Skip for trivial changes (dependency bumps, renames, single-file edits with clear diffStat). Lock files are always excluded from the diff output.

### 3. Draft commit message

Using the `config` and `inferredScope` returned by `commit_prepare`:

- Select `type` from `config.allowedTypes`. See [conventional-commits.md](conventional-commits.md) for type descriptions. When a domain-specific type (e.g., `ai`) matches the purpose of the changes, prefer it over structural types (`refactor`, `docs`, `chore`, `style`) that only describe the form of the change.
- Determine `scope`:
  - When `inferredScope` is non-null, use it as the commit scope. Override only when a domain-specific type (e.g., `ai`) makes a different scope more meaningful.
  - When `inferredScope` is null, determine scope from `filesByWorkspace` keys. If changes span multiple packages, identify the primary package where the intentional change was made (other packages may just have ripple effects). If truly root-level only, omit scope.
- Write subject: imperative mood, **fully lowercase** (no exceptions — abbreviations like `api`, `cli`, `ci`, `url`, `db`, `ui`, `sdk` must be lowercase), no trailing period, concise.
- Verify the full header (`type(scope): subject`) does not exceed `config.headerMaxLength`. If too long, shorten the subject or move detail to the body.
- Write body if non-trivial: explain motivation and what changed, imperative mood.

### 4. Execute

Call `commit_execute` with:
- `files`: absolute paths (prefix each `files[].path` with `repoRoot + "/"`)
- `header`: the drafted conventional commit header
- `body`: optional body text
- `coAuthor`: the model name (e.g., `"Claude Sonnet 4.6"`)

The tool stages, pre-validates, commits, and verifies in a single call.

On failure: the response includes `stage` (`validation`, `staging`, or `commit`) and `errors`. Fix the identified issue and call `commit_execute` again — re-staging is idempotent.

### 5. Report

On success, display:

- Commit hash (short) and full commit message
- List of committed files
- Current branch name
- Remaining uncommitted changes (from `remainingChanges`)
