# @marketplace/plugins-dev-tools

Developer workflow skills and hooks for pnpm monorepos. Provides Claude Code skills for conventional commits, README maintenance, quality gates, PR creation, and an end-to-end ship-it pipeline.

## Skills

| Skill | Description | Usage |
|-------|-------------|-------|
| `commit` | Stage and commit with conventional commits format ([docs](docs/commit-skill.md)) | `/commit [dir-or-files]` |
| `create-issue` | Create a GitHub issue with a structured four-section body | `/create-issue` |
| `update-readme` | Update root and package READMEs from source | `/update-readme [* \| package]` |
| `update-plugins-doc` | Update `marketplaces/docs/plugins.md` when plugin source files change | `/update-plugins-doc` |
| `quality-gate` | Run lint, typecheck, and test across the monorepo | `/quality-gate` |
| `create-pr` | Create or update a GitHub pull request; auto-links `Closes #N` when branch matches `/gh-N` pattern | `/create-pr [target-branch]` |
| `ship-it` | Run quality checks, update docs, push, and open a PR | `/ship-it [target-branch]` |
| `solve-issue` | Take a GitHub issue URL and deliver an opened PR — orchestrates planning, implementation, and shipping | `/solve-issue <issue-url-or-number>` |
| `mcp-poc` | Validate that the plugin MCP server is running and its tools are callable | `/mcp-poc` |

## MCP Server

The plugin bundles a Node.js MCP server (`dist/mcp/server.js`) that exposes commit workflow tools to the skills via the `dev-tools` server name. The server is registered automatically via `.mcp.json` when the plugin is installed.

### MCP Tools

| Tool | Description |
|------|-------------|
| `commit_prepare` | Gather changed files, diff stats, recent commits, and repo config. Call first before `commit_execute`. |
| `commit_diff` | Return the unified diff for specific files or all changed files. Lock files excluded. |
| `commit_execute` | Stage files, validate the commit header, execute the commit, and verify the result. |
| `plugins_doc_prepare` | Check whether `marketplaces/docs/plugins.md` is stale relative to the plugin source tree. Returns status and changed files. |
| `plugins_doc_update` | Write updated content to `marketplaces/docs/plugins.md`. |
| `pr_prepare` | Gather branch state (commits, diff stat, existing PR, issue number) for PR preparation. Call first before `pr_create`. |
| `pr_create` | Render a PR template and create or update a GitHub pull request for the current branch. |
| `readme_prepare` | Gather metadata needed to update README.md files. Detects which packages have source changes (via git diff against a base branch), reads package metadata, and returns structured data. Returns status `up_to_date` when no READMEs need changes. Call this first before writing any READMEs. |
| `issue_fetch` | Fetch a GitHub issue by URL, `#N`, or plain number. Returns structured JSON with title, body, labels, assignees, comments, state, and URL. |
| `issue_create_prepare` | Gather GitHub auth status, repo name, available labels, and projects before creating an issue. Call first to get the context needed to draft issue content. |
| `issue_create_execute` | Create a GitHub issue with a structured four-section body (Purpose, Context, Requirements, Verification). Optionally adds the issue to a project. |
| `ship_preflight` | Run ship-it preflight checks: verify GitHub auth, validate the current branch is not main/master, fetch the target branch, and detect divergence. |
| `plan_read` | Read the plan file for a GitHub issue. Returns existence status, workflow status, task progress (completed/total), branch name, and full content. Plan files live at `.ai/plugins-dev-tools/plans/gh-{N}.md`. |
| `plan_write` | Write or update the plan file for a GitHub issue. Validates YAML frontmatter with required fields (`issue`, `status`). Plan files live at `.ai/plugins-dev-tools/plans/gh-{N}.md`. |
| `echo` | Echo back the input message (diagnostic tool). |
| `repo_info` | Return the git repository root path (diagnostic tool). |

## Agents

| Agent | Model | Description |
|-------|-------|-------------|
| `update-docs-agent` | sonnet | Update all READMEs — used as a sub-agent by `ship-it` |
| `update-plugins-doc-agent` | sonnet | Update `marketplaces/docs/plugins.md` when plugin sources change — used as a sub-agent by `ship-it` |
| `quality-gate-agent` | haiku | Run quality checks — used as a sub-agent by `ship-it` |
| `create-pr-agent` | sonnet | Create a PR — used as a sub-agent by `ship-it` |
| `commit-agent` | sonnet | Stage and commit with conventional commits — used as a sub-agent by `ship-it` |
| `create-issue-agent` | sonnet | Create a GitHub issue — standalone agent wrapping `create-issue` |
| `mcp-poc-agent` | haiku | Run MCP proof of concept — standalone agent wrapping `mcp-poc` |
| `plan-agent` | opus | Explore the codebase and write a structured plan for a GitHub issue — used as a sub-agent by `solve-issue` |
| `implement-agent` | sonnet | Execute a structured plan by implementing each task and committing incrementally — used as a sub-agent by `solve-issue` |

## Hooks

| Hook | Trigger | Behavior |
|------|---------|----------|
| `pre-tool-use` | Any `Bash` tool call | Auto-approves this plugin's MCP tools (prefix `mcp__plugin_plugins-dev-tools_dev-tools__`); rejects `git -C` flag usage |

## Workflow: `ship-it`

The `ship-it` skill automates the full end-of-development pipeline:

1. Preflight checks (branch is not `main`/`master`, uncommitted changes, GitHub auth, branch is up to date with target)
2. Run quality gate via `quality-gate-agent` (lint, typecheck, test) — **pipeline stops here on failure**
3. Update plugin documentation via `update-plugins-doc-agent` (only after step 2 passes; steps 3 and 4 may run in parallel)
4. Update all READMEs via `update-docs-agent` (only after step 2 passes; steps 3 and 4 may run in parallel)
5. Commit any documentation changes via `commit-agent`
6. Push branch to remote
7. Open pull request via `create-pr-agent`
8. Display a summary table of all pipeline step results

```shell
/ship-it             # targets main branch
/ship-it develop     # targets a different base branch
```

## Build

```shell
pnpm build
```

Outputs the built plugin bundle to `marketplaces/monorepo-marketplace/plugins-dev-tools/`. The marketplace bundle is a generated artifact — edit source here, not in the output directory.

## Scripts

| Script | Description |
|--------|-------------|
| `build` | Bundle plugin to the monorepo marketplace |
| `clean` | Remove Turborepo cache and coverage artifacts |
| `lint` | Run ESLint |
| `test` | Run Vitest |
| `typecheck` | TypeScript type check |
