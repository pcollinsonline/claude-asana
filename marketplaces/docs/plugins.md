# Plugin System

This monorepo extends Claude Code with **plugins** — self-contained packages that contribute hooks, skills, agents, or any combination. Plugins are built at development time into zero-dependency bundles and registered through a local marketplace.

## Design philosophy

Claude Code's plugin documentation suggests installing runtime dependencies (e.g. `node_modules`) via a `SessionStart` hook that runs `npm install` into a persistent data directory. This monorepo takes a different approach: **all dependencies are bundled at build time** using esbuild. The result is self-contained CommonJS files with no runtime install step, no network dependency, and deterministic behavior across environments.

This matters because:

- **Session startup is fast** — hooks execute immediately, no blocking `npm install`
- **Builds are deterministic** — what you build is what runs, no version drift
- **Errors surface early** — TypeScript and esbuild catch problems at build time, not at session start
- **Shared infrastructure works naturally** — a shared library (`plugins-base`) provides typed utilities that get inlined during bundling, so plugins share code without shipping shared `node_modules`

---

## Architecture

The system has three layers:

```
┌──────────────────────────────────────────────────────────────┐
│  Source packages     marketplaces/plugins-*/                   │
│  (TypeScript, markdown, MCP servers, tests)                  │
├──────────────────────────────────────────────────────────────┤
│  Build system        packages/plugins-base/src/build-pipeline │
│  (discovery, esbuild, manifest generation)                   │
├──────────────────────────────────────────────────────────────┤
│  Marketplace         marketplaces/monorepo-marketplace/       │
│  (build output, plugin registry)                             │
└──────────────────────────────────────────────────────────────┘
```

Source packages are standard pnpm workspace members. The build system transforms them into plugin bundles. The marketplace aggregates those bundles and exposes them to Claude Code's plugin installer.

---

## Source packages

Plugin source lives under `marketplaces/` and follows the naming convention `plugins-<name>`. Each is a standard TypeScript package with its own `package.json`, `tsconfig.json`, lint config, and test config. Dependencies are declared normally and resolved by pnpm at development time.

### Shared infrastructure: `plugins-base`

The `@packages/plugins-base` package provides utilities that all hook-based plugins use:

| Export | Purpose |
|---|---|
| `readStdin()` | Read hook input from stdin as a `ResultAsync` |
| `parseHookInput<T>()` | Parse JSON string into a typed hook input |
| `parseFrontmatter()` | Parse YAML frontmatter from markdown files into typed objects |
| `appendLogEntry()` | Append a timestamped entry to a JSON log file |
| `createLogStage()` | Factory for composable logging pipeline stages |
| `resolveProjectPath()` | Resolve relative paths against the project root |
| `HookInputError` | Error class for hook input parsing failures |
| `LogFileError` | Error class for log file operation failures |

All functions use `neverthrow` for typed error handling (see [Error handling](#error-handling)). The same package exports the `buildPlugin()` function used by every plugin's build script (see [Build pipeline](#build-pipeline)).

---

## Plugin anatomy

A plugin can contribute **hooks**, **skills**, **agents**, **MCP servers**, or any combination. The source layout determines what the build system discovers.

### Hooks

Hooks are shell commands that Claude Code executes at lifecycle events (session start, tool use, stop, etc.). Each hook is a standalone TypeScript entry point:

```
src/hooks/
  <event-name>/
    index.ts
```

The directory name uses kebab-case and maps to a PascalCase event name during build (e.g. `pre-tool-use` → `PreToolUse`). Every hook follows the same I/O pattern:

```typescript
import { parseHookInput, readStdin } from '@packages/plugins-base'

const main = async (): Promise<void> => {
  const result = await readStdin()
    .andThen(parseHookInput<SomeHookInput>)
    .andThen(doWork)

  if (result.isErr()) {
    console.error(`Hook error: ${result.error.message}`)
  }
  // Always output valid JSON — never let a hook crash
  console.log(JSON.stringify({}))
}

void main()
```

Key conventions:
- **stdin** receives JSON context from Claude Code (event type, tool name, session info, etc.)
- **stdout** must emit a JSON response (often just `{}`)
- **Exit code 0** always — a non-zero exit blocks Claude Code
- **Type the input** using `@anthropic-ai/claude-agent-sdk` types (e.g. `StopHookInput`, `PreToolUseInput`)

### Skills

Skills are user-invocable commands (like `/commit` or `/clear-logs`) defined by a `SKILL.md` file with YAML frontmatter:

```
skills/
  <skill-name>/
    SKILL.md          # frontmatter + instructions
    *.md              # additional reference docs
    templates/        # non-markdown directories (e.g. templates/, images/) — copied as-is
```

A minimal `SKILL.md`:

```markdown
---
name: my-skill
description: What this skill does
argument-hint: "[args]"
allowed-tools: mcp__plugin_my-plugin_my-server__my_tool
---

# My Skill

Instructions for Claude when this skill is invoked.
Call `my_tool` with the relevant arguments from `$ARGUMENTS`.
```

Skills can be:
- **Static** — pure markdown instructions with no compiled code (e.g. a quality-gate workflow that just orchestrates pnpm commands)
- **Script-backed** — markdown that invokes a compiled TypeScript handler via `!` backtick commands
- **MCP-backed** — markdown that instructs the AI to call MCP tools exposed by the plugin's MCP server (e.g. the `commit` skill uses `commit_prepare`, `commit_diff`, and `commit_execute` tools)
- **Hook-bearing** — skills can declare their own hooks in the frontmatter (`hooks: [PreToolUse, Stop]`), which the build system discovers and bundles separately from plugin-level hooks. **Note:** skill-scoped hooks only fire for project-level skills (`.claude/skills/`); they are silently ignored for marketplace/plugin skills. Use plugin-level hooks for reliable behavior (see [MCP auto-approval](#mcp-auto-approval-via-plugin-level-hooks))

#### Skill frontmatter reference

| Field | Required | Description |
|---|---|---|
| `name` | yes | Skill identifier, kebab-case (e.g. `create-pr`) |
| `description` | yes | What the skill does — shown in the `/` command menu |
| `argument-hint` | no | Placeholder shown in UI (e.g. `"[target-branch]"`, `"[* \| package-name]"`) |
| `allowed-tools` | no | Tool constraints for the AI (e.g. `Bash(git log:*), Read`, or MCP tool names like `mcp__plugin_<plugin>_<server>__<tool>`). See [Tool permissions](#tool-permissions) for caveats |
| `hooks` | no | Array of lifecycle events for skill-scoped hooks (e.g. `[PreToolUse, Stop]`). **Plugin limitation:** these hooks are only registered for project-level skills, not marketplace/plugin skills |
| `disable-model-invocation` | no | When `true`, the skill runs without an LLM call — used for pure script-backed skills (e.g. `prime-claude`, `clear-logs`) |

> **Note:** This table covers fields used by the build system. Claude Code supports additional frontmatter fields (`user-invocable`, `model`, `effort`, `context`, `paths`, `shell`) — see the [Claude Code skills documentation](https://docs.anthropic.com/en/docs/claude-code/skills) for the complete reference.

### Agents

Agents are markdown files that define autonomous subprocesses Claude Code can spawn. Each agent has its own model, tool set, and optionally preloaded skills:

```
agents/
  <agent-name>.md
```

An agent definition:

```markdown
---
name: create-pr-agent
description: Analyze branch commits and create a GitHub pull request.
model: sonnet
tools: mcp__plugin_plugins-dev-tools_dev-tools__pr_prepare, mcp__plugin_plugins-dev-tools_dev-tools__pr_create, Read
skills:
  - plugins-dev-tools:create-pr
---

Create a GitHub pull request for the current branch.
Follow the instructions from the preloaded create-pr skill.
Pass through the target branch argument if provided.
Report back the PR URL and whether it was created or updated.
```

Agent frontmatter fields:

| Field | Required | Description |
|---|---|---|
| `name` | yes | Agent identifier, kebab-case |
| `description` | yes | What the agent does — shown in the agent picker |
| `model` | no | Model to use (e.g. `sonnet`, `opus`, `haiku`) |
| `tools` | yes | Tools the agent can invoke. Scoped patterns auto-approve commands (see [Tool permissions](#tool-permissions)) |
| `skills` | no | List of skills to preload at agent startup (e.g. `[plugins-dev-tools:create-pr]`) |

> **Note:** This table covers fields used in this monorepo. Claude Code supports additional agent frontmatter fields (`disallowedTools`, `permissionMode`, `maxTurns`, `mcpServers`, `hooks`, `memory`, `background`, `isolation`) — see the [Claude Code sub-agents documentation](https://docs.anthropic.com/en/docs/claude-code/sub-agents) for the complete reference.

### MCP servers

Plugins can expose tools via a [Model Context Protocol](https://modelcontextprotocol.io/) server. This is an alternative to script-backed skills — instead of shelling out via `!` backtick commands, skills instruct the AI to call MCP tools directly. MCP tools benefit from structured input/output (JSON schemas with validation), richer error reporting, and no shell-quoting issues.

The source layout:

```
src/mcp/
  server.ts             # MCP server entry point
  tools/
    <domain>.ts         # tool implementations (grouped by domain)
```

An MCP server registers tools using the `@modelcontextprotocol/sdk` and validates inputs with `zod`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'dev-tools', version: '0.0.1' })

server.tool('my_tool', 'Description of what it does', { arg: z.string() }, async ({ arg }) => ({
  content: [{ type: 'text', text: `result: ${arg}` }],
}))

const transport = new StdioServerTransport()
await server.connect(transport)
```

Key conventions:
- **stdout is reserved** for JSON-RPC transport — redirect `console.log` to stderr in the server entry point
- **Tool naming** — use `snake_case` for tool names (e.g. `commit_prepare`, `repo_info`)
- **Structured errors** — return `{ isError: true, content: [...] }` for tool-level failures rather than throwing

#### MCP tool naming in Claude Code

When a plugin exposes an MCP server, Claude Code generates fully qualified tool names following this pattern:

```
mcp__plugin_<plugin-name>_<server-name>__<tool-name>
```

For example, the `commit_prepare` tool from the `dev-tools` server in `plugins-dev-tools` becomes:

```
mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare
```

These fully qualified names are used in skill `allowed-tools` and agent `tools` frontmatter to reference specific MCP tools.

#### MCP auto-approval via plugin-level hooks

MCP tools require user approval by default. The **plugin-level** `PreToolUse` hook (`src/hooks/pre-tool-use/index.ts`) handles two concerns: auto-approving the plugin's own MCP tools, and enforcing Bash command rules.

**MCP auto-approval** — the hook checks the tool name prefix and returns an `allow` decision:

```typescript
const MCP_PREFIX = 'mcp__plugin_plugins-dev-tools_dev-tools__'

if (tool_name.startsWith(MCP_PREFIX)) {
  approve(tool_name)  // emits { permissionDecision: 'allow', ... }
  return
}
```

**Bash command enforcement** — the hook also inspects `tool_input.command` for disallowed patterns and returns a `deny` decision. For example, `git -C` is blocked because git already operates on the full repository from any subdirectory:

```typescript
const GIT_DASH_C_PATTERN = /\bgit\s+-C\b/

if (GIT_DASH_C_PATTERN.test(command)) {
  deny('Do not use `git -C`. Git commands already operate on the full repository from any subdirectory. Use absolute paths for file arguments instead.')
  return
}
```

All other tool calls pass through with an empty `{}` response.

This hook auto-approves MCP tools for **direct skill invocations** (e.g. `/commit`).

> **Subagent limitation:** `permissionDecision` from PreToolUse hooks is silently ignored in subagent context (e.g. `commit-agent` spawned by `ship-it`). Claude Code's security boundary prevents plugins from auto-approving their own tools in subagents. For subagent contexts, MCP tools must also be listed in `.claude/settings.json` `permissions.allow`:
>
> ```json
> "permissions": {
>   "allow": [
>     "mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare",
>     "mcp__plugin_plugins-dev-tools_dev-tools__commit_diff",
>     "mcp__plugin_plugins-dev-tools_dev-tools__commit_execute",
>     "mcp__plugin_plugins-dev-tools_dev-tools__echo",
>     "mcp__plugin_plugins-dev-tools_dev-tools__repo_info",
>     "mcp__plugin_plugins-dev-tools_dev-tools__plugins_doc_prepare",
>     "mcp__plugin_plugins-dev-tools_dev-tools__plugins_doc_update",
>     "mcp__plugin_plugins-dev-tools_dev-tools__issue_fetch",
>     "mcp__plugin_plugins-dev-tools_dev-tools__plan_read",
>     "mcp__plugin_plugins-dev-tools_dev-tools__plan_write",
>     "mcp__plugin_plugins-dev-tools_dev-tools__pr_prepare",
>     "mcp__plugin_plugins-dev-tools_dev-tools__pr_create",
>     "mcp__plugin_plugins-dev-tools_dev-tools__readme_prepare",
>     "mcp__plugin_plugins-dev-tools_dev-tools__issue_create_prepare",
>     "mcp__plugin_plugins-dev-tools_dev-tools__issue_create_execute",
>     "mcp__plugin_plugins-dev-tools_dev-tools__ship_preflight"
>   ]
> }
> ```
>
> Both layers are needed: the hook covers direct invocations, `settings.json` covers subagent pipelines.

---

## Build pipeline

Each plugin has a minimal `src/build.ts` that invokes the shared builder:

```typescript
import { buildPlugin } from '@packages/plugins-base/build'

await buildPlugin({
  distDir: path.resolve(import.meta.dirname, '..', '..', 'monorepo-marketplace', '<plugin-name>'),
  rootDir: path.resolve(import.meta.dirname, '..'),
})
```

The `buildPlugin()` function accepts a `PluginBuildConfig` with these fields:

| Field | Required | Description |
|---|---|---|
| `distDir` | yes | Absolute path to the marketplace output directory |
| `rootDir` | yes | Absolute path to the plugin source root |
| `hookAsync` | no | Maps hook directory names to async flags (e.g. `{ 'pre-tool-use': true }`) |
| `hookFlags` | no | Maps hook directory names to CLI flags appended to the command |
| `hookMatchers` | no | Maps hook directory names to matcher regex strings (e.g. `{ 'pre-tool-use': 'Bash' }`) |
| `mcp` | no | MCP server configuration (`{ name: string, entry?: string }`). When provided, bundles `src/mcp/server.ts` (or the path given by `entry`) and generates `.mcp.json` in `distDir` |

Example with async hooks (`plugins-utility`):

```typescript
await buildPlugin({
  distDir: path.resolve(import.meta.dirname, '..', '..', 'monorepo-marketplace', 'plugins-utility'),
  hookAsync: {
    'permission-request': true,
    'post-tool-use': true,
    'post-tool-use-failure': true,
    'pre-tool-use': true,
  },
  rootDir: path.resolve(import.meta.dirname, '..'),
})
```

Example with a hook matcher and MCP server (`plugins-dev-tools`):

```typescript
await buildPlugin({
  distDir: path.resolve(import.meta.dirname, '..', '..', 'monorepo-marketplace', 'plugins-dev-tools'),
  hookMatchers: { 'pre-tool-use': 'Bash' },
  mcp: { name: 'dev-tools' },
  rootDir: path.resolve(import.meta.dirname, '..'),
})
```

When `mcp` is provided, `buildPlugin()` bundles the MCP server entry point (default: `src/mcp/server.ts`) as a separate esbuild invocation and generates `.mcp.json` in `distDir`. The `.mcp.json` file tells Claude Code how to launch the MCP server process. Use the optional `entry` field to override the default path.

The `buildPlugin()` function performs these steps:

### 1. Discovery

Four discovery mechanisms run against the source package:

| Source | What it finds | How |
|---|---|---|
| **Filesystem hooks** | Plugin-level hook entry points | Scans `src/hooks/<name>/index.ts` |
| **Markdown script refs** | Skill scripts to bundle | Regex-scans all `.md` files in `skills/` for `src/skills/<name>/*.ts` references |
| **Frontmatter hooks** | Skill-scoped hook entry points | Parses `hooks:` array in `SKILL.md` YAML frontmatter, maps to `src/skills/<name>/hooks/<event>/index.ts` |
| **Agents** | Agent definitions | Scans `agents/*.md`, copies to output with script references rewritten |

Discovery validates that every referenced file exists, accumulates all errors, and reports them with clear messages before bundling begins.

### 2. Bundling

All discovered entry points are bundled with **esbuild**:
- Format: CommonJS (Claude Code runs hooks via `node`, which needs CJS for the output directory)
- Target: Node 22
- All dependencies are inlined — the output has zero runtime imports
- A `dist/package.json` with `"type": "commonjs"` is generated to override the parent's ESM setting

### 3. Manifest generation

- **`plugin.json`** — derived from the source `package.json` (name, version, description, license). The `@scope/` prefix is stripped from the name. The version includes a `+gitsha` suffix (e.g. `1.0.0+34edf59`) for build traceability.
- **`hooks.json`** — maps PascalCase event names to hook commands. Each hook entry supports optional fields:
  - `async: true` — runs the hook in the background (from `hookAsync` config)
  - `matcher` — regex string to filter which tool invocations trigger the hook (from `hookMatchers` config)
  - CLI flags appended to the command (from `hookFlags` config)

  Skill-scoped hooks (declared via `hooks:` frontmatter) generate a separate `hooks.json` under `skills/<name>/hooks/` and do not support `async` or `matcher` fields.

### 4. Skill output

For skills with bundled code:
- Markdown files are copied with script references rewritten: `src/skills/<name>/handler.ts` becomes `${CLAUDE_PLUGIN_ROOT}/dist/skills/<name>/handler.js`
- Non-markdown directories (e.g. `templates/`) are copied as-is
- If the skill declares hooks, a skill-scoped `hooks/hooks.json` is generated

For static skills (no script references), the entire skill directory is copied verbatim.

### Build output structure

After building, a plugin's output in the marketplace looks like:

```
monorepo-marketplace/<plugin-name>/
  .claude-plugin/
    plugin.json               # metadata manifest
  .mcp.json                   # MCP server config (if plugin has an MCP server)
  agents/
    <agent-name>.md           # agent definitions (copied from source)
  dist/
    package.json              # { "type": "commonjs" }
    hooks/
      <event-name>.js         # bundled hook handlers
    mcp/
      server.js               # bundled MCP server (if present)
    skills/
      <skill-name>/
        <handler>.js          # bundled skill scripts
  hooks/
    hooks.json                # hook registration for Claude Code
  skills/
    <skill-name>/
      SKILL.md                # rewritten skill definition
      hooks/
        hooks.json            # skill-scoped hooks (if any)
      templates/              # copied non-markdown directories
```

---

## Marketplace

The marketplace is the bridge between built artifacts and Claude Code's plugin installer.

### Structure

The marketplace directory contains:
- **`.claude-plugin/marketplace.json`** — the plugin registry (committed to git)
- **`<plugin-name>/`** — build output directories (gitignored)

The registry lists available plugins:

```json
{
  "name": "claude-asana",
  "description": "Claude Code plugins for pnpm monorepos: dev-tools, utility, claude",
  "owner": { "name": "..." },
  "plugins": [
    { "name": "plugins-utility", "description": "...", "version": "1.0.0", "source": "./plugins-utility" },
    { "name": "plugins-claude",  "description": "...", "version": "1.0.0", "source": "./plugins-claude" },
    { "name": "plugins-dev-tools", "description": "...", "version": "1.0.0", "source": "./plugins-dev-tools" }
  ]
}
```

Each `source` points to a build output directory relative to the marketplace root.

### Gitignore strategy

Plugin bundle directories under `marketplaces/monorepo-marketplace/` **are committed** (see `.gitignore` — the global `dist/` rule is overridden for this subtree). This lets external consumers install via the `github` source without cloning + building locally. The global `dist/` rule still applies to in-source build outputs (`marketplaces/plugins-*/dist/`, `packages/*/dist/`).

Trade-off: every commit that changes plugin source produces a bundle diff. Mitigation (planned): a future CI workflow will own bundle commits on merge to `main`, keeping feature-branch diffs source-only.

---

## Installation and scopes

### Automatic setup

The marketplace and its plugins are registered declaratively in `.claude/settings.json` — no CLI install step is required. The settings file declares the marketplace location via `extraKnownMarketplaces` and enables individual plugins via `enabledPlugins`:

```json
{
  "extraKnownMarketplaces": {
    "claude-asana": {
      "source": {
        "source": "directory",
        "path": "./marketplaces/monorepo-marketplace"
      }
    }
  },
  "enabledPlugins": {
    "plugins-utility@claude-asana": true,
    "plugins-claude@claude-asana": true,
    "plugins-dev-tools@claude-asana": true
  }
}
```

After cloning, run `pnpm install && pnpm build` (see [Development workflow](#development-workflow)).

### Scope model

| Scope | Settings file | Use case |
|---|---|---|
| `project` | `.claude/settings.json` | Team-shared plugins, committed to git |
| `local` | `.claude/settings.local.json` | Developer-specific plugins, gitignored |

This monorepo enables all marketplace plugins at `project` scope (committed to git in `.claude/settings.json`). Developer-specific overrides go in `.claude/settings.local.json`.

### Plugin caching

When Claude Code installs a marketplace plugin, it copies the bundle to `~/.claude/plugins/cache/`. The cache is **keyed by the version string** in `plugin.json`:

- **Same version** → cached copy is reused, even after uninstall + reinstall (uninstall removes from settings, not from cache)
- **Different version** → fresh copy is cached on next install

Since `buildPlugin()` appends a `+gitsha` suffix to the version (e.g. `1.0.0+34edf59`), every build produces a distinct version. This means `plugins-refresh.sh` (which builds then reinstalls) correctly picks up changes — the new git SHA triggers a cache refresh.

For development, use `--plugin-dir` to bypass the cache entirely (see [Development workflow](#development-workflow)).

---

## Development workflow

### Initial setup

```bash
pnpm install && pnpm build    # install deps, build all packages (plugins are registered via settings.json)
```

### Iterating on a plugin

**For development**, use `claude-dev.sh` to launch Claude Code with plugins loaded directly from disk, bypassing the cache entirely:

```bash
scripts/claude-dev.sh              # launches claude with --plugin-dir flags for all marketplace plugins
```

The script uninstalls marketplace plugins (so `--plugin-dir` takes full control), builds all plugin workspaces, then launches `claude` with `--plugin-dir` pointing to each plugin's build output. After rebuilding plugins mid-session, run `/reload-plugins` inside Claude Code to pick up changes without restarting.

**To update cached plugins** (e.g. before switching back to a normal `claude` invocation), use the refresh script:

```bash
scripts/plugins-refresh.sh         # rebuild + reinstall all enabled marketplace plugins
```

This works because each build produces a new `+gitsha` version, which triggers a cache refresh on reinstall.

---

## Tool permissions

The `tools:` field in an agent's frontmatter is the **permission allowlist** that controls which tools the agent can invoke and whether commands require user approval.

### Scoped vs. unrestricted Bash

- **Unrestricted `Bash`** — the agent can run any shell command, but every command triggers a "This command requires approval" prompt
- **Scoped patterns** like `Bash(pnpm *)` or `Bash(git log:*)` — the agent can only run matching commands, and they are **auto-approved** (no prompt)

Always scope agent tools to the minimum required patterns. Examples from this monorepo:

| Agent | Tools | Rationale |
|---|---|---|
| `quality-gate-agent` | `Bash(pnpm *)` | Only runs pnpm commands |
| `create-pr-agent` | `mcp__plugin_plugins-dev-tools_dev-tools__pr_prepare, mcp__plugin_plugins-dev-tools_dev-tools__pr_create, Read` | MCP tools for PR workflow + file reading |
| `create-issue-agent` | `mcp__plugin_plugins-dev-tools_dev-tools__issue_create_prepare, mcp__plugin_plugins-dev-tools_dev-tools__issue_create_execute` | MCP tools for issue creation workflow |
| `update-docs-agent` | `mcp__plugin_plugins-dev-tools_dev-tools__readme_prepare, Read, Write, Edit` | MCP tool for README metadata + file tools |
| `update-plugins-doc-agent` | `mcp__plugin_plugins-dev-tools_dev-tools__plugins_doc_prepare, Edit, Read` | MCP tool for doc freshness check + file tools for reading and editing |
| `commit-agent` | `mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare, mcp__plugin_plugins-dev-tools_dev-tools__commit_diff, mcp__plugin_plugins-dev-tools_dev-tools__commit_execute` | MCP tools for commit workflow |
| `plan-agent` | `Read, Glob, Grep, mcp__plugin_plugins-dev-tools_dev-tools__issue_fetch, mcp__plugin_plugins-dev-tools_dev-tools__plan_read, mcp__plugin_plugins-dev-tools_dev-tools__plan_write` | Read-only codebase analysis; produces a structured implementation plan |
| `implement-agent` | `Read, Glob, Grep, Write, Edit, Bash(pnpm *), Bash(git diff *), Bash(git status *), mcp__plugin_plugins-dev-tools_dev-tools__plan_read, mcp__plugin_plugins-dev-tools_dev-tools__plan_write, mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare, mcp__plugin_plugins-dev-tools_dev-tools__commit_diff, mcp__plugin_plugins-dev-tools_dev-tools__commit_execute` | Executes plan tasks with incremental commits |
| `mcp-poc-agent` | `mcp__plugin_plugins-dev-tools_dev-tools__echo, mcp__plugin_plugins-dev-tools_dev-tools__repo_info` | MCP tools only, proof-of-concept |

### MCP tools in allowlists

MCP tools can appear in both skill `allowed-tools` and agent `tools` using their fully qualified names:

```yaml
# In a skill's SKILL.md
allowed-tools: mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare, mcp__plugin_plugins-dev-tools_dev-tools__commit_diff, mcp__plugin_plugins-dev-tools_dev-tools__commit_execute

# In an agent's frontmatter
tools: mcp__plugin_plugins-dev-tools_dev-tools__commit_prepare, mcp__plugin_plugins-dev-tools_dev-tools__commit_diff, mcp__plugin_plugins-dev-tools_dev-tools__commit_execute
```

Unlike `Bash(...)` patterns, MCP tool names are listed verbatim — there is no glob syntax. Each tool must be listed individually.

### Skill `allowed-tools` vs. agent `tools`

These are separate mechanisms:

- **Skill `allowed-tools`** — a semantic constraint in the skill's YAML frontmatter. It tells the AI which tools the skill intends to use. As of March 2025, this field does **not** grant or enforce permissions at runtime ([Claude Code #14956](https://github.com/anthropics/claude-code/issues/14956)).
- **Agent `tools`** — the actual permission allowlist enforced by Claude Code's runtime. Scoped patterns here auto-approve matching commands.

**Rule:** an agent's `tools` must be scoped to match the patterns declared in its skill's `allowed-tools`. The skill declares intent; the agent enforces it.

---

## Orchestration patterns

Plugins can compose skills and agents into multi-step workflows. There are two ways for an agent to use a skill:

- **Preloaded** (`skills:` frontmatter) — the skill's full content is injected at agent startup. Prefer this for single-purpose agents — it eliminates a tool call and makes intent explicit.
- **Runtime** (`Skill` tool) — the agent invokes skills dynamically during execution. Use this in orchestrator skills that conditionally invoke different skills.

### Agent → skill (preloaded)

An agent preloads a skill via `skills:` frontmatter and follows its instructions:

```
Agent(prompt: 'Create or update a PR targeting main', agent: 'create-pr-agent')
```

### Skill → agents

An orchestrator skill spawns agents for independent subtasks:

```
Agent(prompt: 'Update all READMEs in the monorepo', agent: 'update-docs-agent')
Agent(prompt: 'Run all quality checks', agent: 'quality-gate-agent')
```

### Skill → skills (runtime)

An orchestrator skill invokes other skills via the `Skill` tool for tasks that should run in the current context (not a subprocess):

```
Skill(prompt: '/plugins-dev-tools:commit', args: '<changed-files>')
```

### Pipeline pattern

The `ship-it` skill demonstrates a pipeline with a hard sequential gate: preflight checks (branch validation, auth, divergence detection) → quality gate → [update plugin docs ∥ update READMEs] → commit doc changes → push → create PR. The quality gate is a blocking step — documentation updates, push, and PR creation do not begin until it passes. Steps 3 and 4 (the two documentation update agents) may run in parallel with each other, but only after the quality gate completes successfully. Preflight failures and quality gate failures both stop the pipeline immediately.

The `solve-issue` skill demonstrates a longer sequential pipeline: parse issue → resume detection → branch setup → plan phase (`plan-agent`) → implement phase (`implement-agent`) → ship phase (`ship-it`). Each phase is strictly gated on the previous one completing successfully. The plan-agent writes a structured plan file (`.ai/plugins-dev-tools/plans/gh-{N}.md`) which the implement-agent reads and executes task by task, committing after each. The pipeline is resumable: if interrupted, re-invoking `solve-issue` with the same issue number resumes from the correct phase based on the plan's `status` field (`planning`, `implementing`, `shipping`, `complete`).

---

## Conventions

### Error handling

All hook code uses `neverthrow` for composable, typed error handling. The pattern is a pipeline of `Result`/`ResultAsync` operations chained with `.andThen()`:

```typescript
readStdin()                        // ResultAsync<string, HookInputError>
  .andThen(parseHookInput<T>)      // Result<T, HookInputError>
  .andThen(processInput)           // ResultAsync<void, SomeError>
```

Errors are values, not exceptions. This guarantees hooks always exit cleanly.

#### Why neverthrow (not Effect)

The main application packages use [Effect-TS](https://effect.website/) for typed error handling. Plugins use `neverthrow` instead because Effect's module graph produces bloated CJS bundles, its runtime initialization adds measurable latency to short-lived hooks, and hooks don't need Effect's layers, services, or fibers. `neverthrow` provides just `Result<T, E>` in ~5 KB with zero transitive dependencies. The boundary is clean: application code uses Effect, plugin code uses neverthrow — the two never mix at import time.

### Path resolution

Hooks run in an unpredictable working directory. The `resolveProjectPath()` utility resolves relative paths against:
1. An explicit argument (for testing)
2. `CLAUDE_PROJECT_DIR` environment variable (injected by Claude Code at hook invocation)
3. `process.cwd()` as fallback

Plugins that write files (logs, config, archives) use paths relative to the project root (e.g. `.ai/plugins-utility/logs/`).

### Plugin-specific config

Plugins can read runtime configuration from a JSON file at a well-known path under `.ai/`. For example, the utility plugin reads `.ai/plugins-utility/config.json` to determine which hooks have logging disabled. Missing config files are treated as "use defaults" — never an error.

### Shell quoting safety

Claude Code's bash safety heuristics can cause approval prompts even for pre-approved tool patterns. There are two strategies:

**Prefer MCP tools** — MCP tools receive structured JSON input and return structured JSON output, completely bypassing shell quoting issues. The `commit` skill was migrated from bash scripts to MCP tools (`commit_prepare`, `commit_diff`, `commit_execute`) partly for this reason. When a skill's workflow involves complex strings (markdown, angle brackets, multi-line content), MCP tools are the better choice.

**Workarounds for script-backed skills** — when bash scripts are still needed:

- **Markdown `#` in arguments** — `#`-prefixed lines after a newline trigger a warning. Have the script own the markdown template and pass structured content as separate arguments, assembling headings internally.
- **Complex strings** — heredocs, ANSI-C quoting, angle brackets, and command substitution in arguments trigger similar warnings. Split complex content into simple positional arguments and assemble inside the script.
- **Temp files** — avoid the `Write` tool for temp files in skill scripts. Its Read-before-Write guard breaks when the same path is reused across invocations.

### Naming conventions

| Context | Convention | Example |
|---|---|---|
| Package name | `@marketplace/plugins-<name>` | `@marketplace/plugins-utility` |
| Hook directory | kebab-case event name | `pre-tool-use/` |
| Hook event (in manifests) | PascalCase | `PreToolUse` |
| Skill directory | kebab-case skill name | `clear-logs/` |
| Agent file | kebab-case with `-agent` suffix | `create-pr-agent.md` |
| Build output | same name without `@marketplace/` | `plugins-utility/` |
| Marketplace identifier | `<name>@<marketplace>` | `plugins-utility@claude-asana` |

---

## Adding a new plugin

1. **Create the package** under `marketplaces/` following the `plugins-<name>` convention. Use an existing plugin as a template for `package.json`, `tsconfig.json`, lint, and test config.

2. **Add `@packages/plugins-base`** as a dependency (for hook utilities and the build function).

3. **Write hooks and/or skills** following the directory conventions above.

4. **Create `src/build.ts`** — a ~5-line file that calls `buildPlugin()` with your `rootDir` and `distDir`. If the plugin includes an MCP server, pass `mcp: { name: '<server-name>' }` to `buildPlugin()` — bundling and `.mcp.json` generation are handled automatically (see [MCP servers](#mcp-servers)).

5. **Register in the marketplace** — add an entry to `marketplace.json` with `name`, `description`, `version`, and `source` pointing to the build output directory.

6. **Enable** — add `"<name>@claude-asana": true` to `enabledPlugins` in `.claude/settings.json`.

The build system discovers everything else automatically from the filesystem layout and markdown content.
