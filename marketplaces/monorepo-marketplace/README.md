# Bundle output

This directory holds the **built plugin bundles** for the `claude-asana` marketplace. The marketplace registry itself lives at the repo root (`.claude-plugin/marketplace.json`).

Each plugin source lives under `marketplaces/<plugin-name>/` — running `pnpm build` in that workspace outputs a bundle into one of the `plugins-*/` subdirectories here. Everything in those subdirectories is generated and overwritten on each build; do not edit by hand.

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
