# claude-asana

Source monorepo for a set of Claude Code plugins (`plugins-utility`, `plugins-claude`, `plugins-dev-tools`) and the build infrastructure that bundles them. Designed to be shared across consumer monorepos via git submodule, subtree, or by building and publishing the marketplace bundle.

## Structure

| Path | Purpose |
|---|---|
| `marketplaces/monorepo-marketplace/` | Plugin registry (`marketplace.json`) — bundle output is gitignored |
| `marketplaces/plugins-claude/` | Plugin: Claude Code reference docs and README enforcement |
| `marketplaces/plugins-dev-tools/` | Plugin: developer workflow skills, agents, and MCP server for pnpm monorepos |
| `marketplaces/plugins-utility/` | Plugin: logging hooks for all Claude Code lifecycle events |
| `marketplaces/docs/` | Architecture documentation (`plugins.md`) — start here |
| `packages/plugins-base/` | Shared build pipeline (`buildPlugin`) and runtime utilities (`readStdin`, `parseHookInput`, etc.) used by every plugin |
| `toolchain/eslint-config/` | Shared ESLint configuration (Node profile) |
| `toolchain/typescript-config/` | Shared `tsconfig` presets |
| `toolchain/vitest-config/` | Shared Vitest configuration |
| `scripts/claude-dev.sh` | Launch Claude Code with `--plugin-dir` so plugins load directly from build output (bypasses cache) |
| `scripts/plugins-refresh.sh` | Rebuild + reinstall enabled marketplace plugins |

## Quickstart

```sh
pnpm install
pnpm build
```

After the first build, plugin bundles appear under `marketplaces/monorepo-marketplace/<plugin-name>/`. These are gitignored — every developer rebuilds locally.

To use the plugins in a Claude Code session, add this monorepo's marketplace to your project's `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "monorepo-marketplace": {
      "source": {
        "source": "directory",
        "path": "<path-to-this-repo>/marketplaces/monorepo-marketplace"
      }
    }
  },
  "enabledPlugins": {
    "plugins-utility@monorepo-marketplace": true,
    "plugins-claude@monorepo-marketplace": true,
    "plugins-dev-tools@monorepo-marketplace": true
  }
}
```

For day-to-day plugin development, use `scripts/claude-dev.sh` to launch Claude Code with `--plugin-dir` flags pointing directly at build output (no cache).

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

## Toolchain note

The `toolchain/` directory is a vendored copy of the same configs published as the [`dr-mike`](https://www.npmjs.com/package/dr-mike) npm package. Once `dr-mike` is stable, swap the `@toolchain/*` workspace dependencies for the published package and delete `toolchain/`.

## Conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) and is set up with husky + lint-staged + commitlint. See `CLAUDE.md` for AI-assistant guidance.

## License

UNLICENSED — internal use.
