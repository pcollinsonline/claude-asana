# claude-asana

Local Claude Code plugin marketplace for the monorepo. Each plugin source lives under `marketplaces/<plugin-name>/` — running `pnpm build` in that workspace outputs a bundle into this directory.

The only hand-maintained files here are `.claude-plugin/marketplace.json` (the plugin registry) and this README. Everything else is generated and will be overwritten on build.

## Installation

Plugins are installed individually per developer. Use `claude plugin install` with the desired scope:

```shell
claude plugin install plugins-dev-tools@claude-asana -s local
claude plugin install plugins-claude@claude-asana -s local
claude plugin install plugins-utility@claude-asana -s local
```

To rebuild all plugin bundles and reinstall any already-enabled plugins, run:

```shell
pnpm run -w build
./scripts/plugins-refresh.sh
```

`plugins-refresh.sh` reads `.claude/settings.json` and `.claude/settings.local.json` to discover which `@claude-asana` plugins are enabled, rebuilds the plugin workspaces, then uninstalls and reinstalls each one. Re-running is idempotent.

## Adding a Plugin

1. Create a new workspace under `marketplaces/<my-plugin>/` (use an existing plugin as a reference)
2. Register it in `.claude-plugin/marketplace.json`
3. Run `pnpm build` in the new workspace to generate the bundle
4. Install with `claude plugin install <my-plugin>@claude-asana -s local`
