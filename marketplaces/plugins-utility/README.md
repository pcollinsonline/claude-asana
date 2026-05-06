# @marketplace/plugins-utility

Opt-in logging hooks for all Claude Code lifecycle events. Each hook writes its input payload to a JSON log file under `.ai/plugins-utility/logs/`, with per-hook disable support via a runtime config file. Includes a `/clear-logs` skill for managing log lifecycle.

## Structure

```
marketplaces/plugins-utility/
├── skills/
│   └── clear-logs/
│       └── SKILL.md                    # Log cleanup skill
├── src/
│   ├── build.ts                        # Build script
│   ├── config.ts                       # Runtime config loader
│   ├── create-hook-logger.ts           # Config-aware log stage factory
│   ├── hook-main.ts                    # Shared async hook entry point
│   ├── paths.ts                        # Plugin directory constants
│   ├── hooks/
│   │   ├── session-start/index.ts
│   │   ├── session-end/index.ts
│   │   ├── setup/index.ts
│   │   ├── stop/index.ts
│   │   ├── pre-tool-use/index.ts
│   │   ├── post-tool-use/index.ts
│   │   ├── post-tool-use-failure/index.ts
│   │   ├── permission-request/index.ts
│   │   ├── notification/index.ts
│   │   ├── pre-compact/index.ts
│   │   ├── subagent-start/index.ts
│   │   ├── subagent-stop/index.ts
│   │   └── user-prompt-submit/index.ts
│   └── skills/
│       └── clear-logs/
│           └── clear-logs.ts           # Archive & delete log files
```

## Installation

This plugin is opt-in per developer (not installed by default):

```shell
claude plugin install plugins-utility@monorepo-marketplace --scope local
```

## Configuration

Logging is enabled for all hooks by default. To disable specific hooks, create `.ai/plugins-utility/config.json` in the project root:

```json
{
  "logging": {
    "disabled": ["pre_tool_use", "post_tool_use"]
  }
}
```

Hook names use snake_case and match the log file stems (e.g., `session_start`, `permission_request`).

## Skills

### `/clear-logs`

Delete all hook log files from `.ai/plugins-utility/logs/`.

- `/clear-logs` — delete all log files immediately
- `/clear-logs archive` — create a timestamped zip archive in `.ai/plugins-utility/archives/` before deleting

Archive filenames use the format `YYYYMMDD-HHMMSS-mmm_logs.zip`.

## API

| Export | Description |
|--------|-------------|
| `createHookLogger(hookName)` | Returns a config-aware logging stage that writes hook input to a JSON file, or no-ops if disabled |
| `isLoggingEnabled(hookName)` | Checks runtime config to determine if logging is enabled for a given hook |
| `ConfigError` | Error class for malformed config files |

## Scripts

| Script | Description |
|--------|-------------|
| `build` | Bundle plugin to `marketplaces/monorepo-marketplace/plugins-utility/` |
| `clean` | Remove Turborepo cache and coverage artifacts |
| `lint` | Run ESLint |
| `test` | Run Vitest |
| `typecheck` | TypeScript type check |

## Build

```shell
pnpm build
```

Outputs the built plugin bundle to `marketplaces/monorepo-marketplace/plugins-utility/`. The marketplace bundle is a generated artifact — edit source here, not in the output directory.
