# @packages/plugins-base

Shared hook infrastructure and build tooling for Claude Code plugins.

## Usage

Two export paths are available:

### Hook infrastructure (`@packages/plugins-base`)

Utilities for building Claude Code hook entry points that read JSON from stdin, log to JSON Lines files, and resolve paths relative to the project root.

```typescript
import {
  parseHookInput,
  readStdin,
  appendLogEntry,
  createLogStage,
  parseFrontmatter,
  resolveProjectPath,
  HookInputError,
  LogFileError,
} from '@packages/plugins-base'
```

### Build tooling (`@packages/plugins-base/build`)

Shared build pipeline that produces a self-contained Claude Code plugin from TypeScript source. Discovers hook entry points, skill scripts, skill hooks, and agents automatically, then bundles with esbuild and generates `plugin.json`, `hooks.json`, and `.mcp.json`.

#### Basic usage

```typescript
import { buildPlugin } from '@packages/plugins-base/build'

await buildPlugin({
  distDir: path.resolve(import.meta.dirname, '..', 'monorepo-marketplace', 'my-plugin'),
  rootDir: path.resolve(import.meta.dirname, '..'),
})
```

#### With MCP server

```typescript
await buildPlugin({
  distDir: path.resolve(import.meta.dirname, '..', 'monorepo-marketplace', 'my-plugin'),
  mcp: { name: 'my-server' },
  rootDir: path.resolve(import.meta.dirname, '..'),
})
```

When `mcp` is provided, `buildPlugin()` bundles `src/mcp/server.ts` and generates `.mcp.json` in the output directory.

#### Modular API

For direct esbuild control, use the individual build phases instead of the convenience wrapper:

```typescript
import { discoverPlugin, createBuildConfig } from '@packages/plugins-base/build'
import { build } from 'esbuild'

const plan = discoverPlugin({ rootDir, distDir })
const config = createBuildConfig(plan, { rootDir, distDir })
await build(config)
```

The generated `plugin.json` version is `<package.json version>+<git SHA>` (e.g., `1.0.0+7e14763`) for automatic cache busting.

## API

### Hook infrastructure

#### `readStdin(): ResultAsync<string, HookInputError>`

Reads all data from stdin as a string.

#### `parseHookInput<T>(input: string): Result<T, HookInputError>`

Parses JSON input from stdin into the specified hook input type.

#### `appendLogEntry(filePath: string, entry: unknown): ResultAsync<void, LogFileError>`

Appends a structured entry to a JSON Lines log file. Creates parent directories if needed.

#### `createLogStage<T>(filePath: string): (input: T) => ResultAsync<void, LogFileError>`

Factory for creating pipeline stages that enrich input with a `logged_at` timestamp and append to the specified log file.

#### `parseFrontmatter(content: string): { body: string; frontmatter: Record<string, unknown> }`

Parses YAML frontmatter from a markdown file. Returns `body` (content after the frontmatter block) and `frontmatter` (the parsed YAML object).

#### `resolveProjectPath(filePath: string, projectDir?: string): string`

Resolves a relative file path against the project root. Uses `projectDir` argument, then `CLAUDE_PROJECT_DIR` env var, then `process.cwd()`.

### Build tooling

#### `buildPlugin(config: PluginBuildConfig): Promise<PluginBuildResult>`

Builds a complete Claude Code plugin from source. Orchestrates discovery, esbuild bundling (including MCP server if configured), and asset emission.

Returns a `PluginBuildResult` containing the esbuild `metafile` (for post-build analysis) and the `plan` that was executed.

#### `discoverPlugin(config: PluginBuildConfig): PluginBuildPlan`

Scans a plugin's source tree and returns a typed build plan. Discovery is synchronous and performs no writes. Throws if any referenced files are missing.

#### `createBuildConfig(plan: PluginBuildPlan, config: PluginBuildConfig): BuildOptions`

Creates esbuild `BuildOptions` for bundling a plugin's entry points. Enables `metafile: true` for post-build verification.

#### `createMcpBuildConfig(config: PluginBuildConfig, mcpEntry: string): BuildOptions`

Creates esbuild `BuildOptions` for bundling an MCP server as a single output file.

#### `emitAssets(plan: PluginBuildPlan, config: PluginBuildConfig): void`

Writes all non-esbuild artifacts: `plugin.json`, `hooks.json`, skill/agent markdown (with script reference rewriting), and `.mcp.json`.

#### `rewriteScriptRefs(content: string, componentType: 'skills' | 'agents', componentName: string): string`

Rewrites TypeScript source paths in markdown to bundled JS paths under `${CLAUDE_PLUGIN_ROOT}/dist/`.

#### `collectMarkdownFiles(dir: string): string[]`

Returns absolute paths to all `.md` files found recursively under `dir`.

#### `toKebabCase(str: string): string`

Converts a string to kebab-case (e.g. `PreToolUse` → `pre-tool-use`).

#### `toPascalCase(str: string): string`

Converts a kebab-case string to PascalCase (e.g. `pre-tool-use` → `PreToolUse`).

### `PluginBuildConfig`

| Parameter | Type | Description |
|-----------|------|-------------|
| `distDir` | `string` | Absolute path to the marketplace output directory |
| `rootDir` | `string` | Absolute path to the plugin source root |
| `hookAsync` | `Record<string, boolean>` | Maps hook names to async flag (optional) |
| `hookFlags` | `Record<string, string>` | Maps hook names to CLI flags (optional) |
| `hookMatchers` | `Record<string, string>` | Maps hook names to matcher regex strings (optional) |
| `mcp` | `McpServerConfig` | MCP server config — `name` (required), `entry` (optional, defaults to `src/mcp/server.ts`) |

## Architecture

The build pipeline is split into three phases under `src/build-pipeline/`:

| Module | Responsibility |
|--------|---------------|
| `discover.ts` | Filesystem scanning and validation — returns `PluginBuildPlan` |
| `esbuild-config.ts` | Pure data transformation — returns esbuild `BuildOptions` |
| `emit-assets.ts` | Post-build writes — manifests, hooks.json, markdown rewriting, MCP config |
| `index.ts` | Orchestrator — `buildPlugin()` convenience wrapper |
| `rewrite-script-refs.ts` | Standalone markdown path rewriting function |
| `types.ts` | All build-related type definitions |

## Scripts

| Script | Description |
|--------|-------------|
| `lint` | Run ESLint |
| `test` | Run Vitest unit tests |
| `typecheck` | TypeScript type check (no emit) |
| `clean` | Remove `.turbo` and `coverage` artifacts |
