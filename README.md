# claude-asana

Claude Code plugins for pnpm monorepos: `plugins-utility` (lifecycle logging), `plugins-claude` (reference-doc enforcement), and `plugins-dev-tools` (developer-workflow skills, agents, and an MCP server). Distributed as an org-wide marketplace from this repo — bundles are committed alongside source, so consumers install with no clone or build.

## Consuming this marketplace

Paste this into your project's `.claude/settings.json` (or `~/.claude/settings.json` for user scope):

```json
{
  "extraKnownMarketplaces": {
    "claude-asana": {
      "source": {
        "source": "github",
        "repo": "pcollinsonline/claude-asana"
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

Run `claude` and check `/plugin list` — the three plugins should appear and be enabled. No clone, no build, no auth (this repo is public).

To pick a subset, drop entries from `enabledPlugins`. To pin to a specific commit or branch, add `"ref": "<sha-or-branch>"` next to `"repo"` in the source.

## Structure

| Path | Purpose |
|---|---|
| `.claude-plugin/marketplace.json` | Plugin registry — root-level so the github source resolves with no `path` field |
| `marketplaces/monorepo-marketplace/` | Committed bundle output (one subdir per plugin) — what consumers fetch |
| `marketplaces/plugins-claude/` | Plugin source: Claude Code reference docs and README enforcement |
| `marketplaces/plugins-dev-tools/` | Plugin source: developer workflow skills, agents, and MCP server for pnpm monorepos |
| `marketplaces/plugins-utility/` | Plugin source: logging hooks for all Claude Code lifecycle events |
| `marketplaces/docs/` | Architecture documentation (`plugins.md`) — start here for plugin internals |
| `packages/plugins-base/` | Shared build pipeline (`buildPlugin`) and runtime utilities (`readStdin`, `parseHookInput`, etc.) used by every plugin |
| `scripts/claude-dev.sh` | Launch Claude Code with `--plugin-dir` so plugins load directly from build output (bypasses cache) |
| `scripts/plugins-refresh.sh` | Rebuild + reinstall enabled marketplace plugins |

## Local development

For working on the plugins themselves (rather than consuming them), point your settings at the local checkout via the `directory` source:

```json
{
  "extraKnownMarketplaces": {
    "claude-asana": {
      "source": {
        "source": "directory",
        "path": "<path-to-this-repo>"
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

Then:

```sh
pnpm install
pnpm build
```

For day-to-day iteration, use `scripts/claude-dev.sh` instead — it launches Claude Code with `--plugin-dir` flags pointing directly at build output (no cache).

## Architecture

See [`marketplaces/docs/plugins.md`](./marketplaces/docs/plugins.md) for the full design — discovery, build pipeline, MCP servers, hook conventions, tool permissions, and orchestration patterns.

## Scripts

| Command | What it does |
|---|---|
| `pnpm build` | Bundle every plugin into `marketplaces/monorepo-marketplace/<plugin>/` via esbuild |
| `pnpm test` | Run the vitest suites across all workspaces |
| `pnpm lint` | Run eslint across all workspaces |
| `pnpm typecheck` | Run `tsc --noEmit` across all workspaces |
| `pnpm clean` | Remove `.turbo` and `coverage` from each workspace |
| `pnpm format` | Run prettier on the entire repo |
| `scripts/claude-dev.sh` | Launch Claude Code with plugins loaded from disk |
| `scripts/plugins-refresh.sh` | Rebuild and reinstall enabled marketplace plugins |

## Toolchain

Shared ESLint, TypeScript, and Vitest configuration comes from the [`dr-mike`](https://www.npmjs.com/package/dr-mike) npm package (`dr-mike/eslint`, `dr-mike/tsconfig/node`, `dr-mike/vitest`).

## Conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) and is set up with husky + lint-staged + commitlint. See `CLAUDE.md` for AI-assistant guidance.

## License

UNLICENSED — internal use.
