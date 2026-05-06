# CLAUDE.md

Source monorepo for Claude Code plugins. PNPM workspaces, Turborepo, ESM throughout.

- **Architecture**: read `marketplaces/docs/plugins.md` first — it covers discovery, build pipeline, MCP servers, hooks, tool permissions, and orchestration patterns.
- **Accuracy**: Don't be sycophantic. Be thorough and accurate.
- **Quality gates**: Run lint, typecheck, and tests after code changes. Lint with the `--fix` flag (`pnpm turbo lint -- --fix`). Never skip verification.
- **Tools**:
  - **Use jq** for JSON parsing.
  - **Never use Python** for ad-hoc tasks.
  - **Never use npm or npx** — always use pnpm.

## Plugin development

After editing plugin source, you MUST rebuild before changes take effect in a Claude Code session. Two options:

```sh
pnpm build                    # rebuild all plugins
scripts/plugins-refresh.sh    # rebuild + reinstall enabled plugins
```

For iterative development, prefer `scripts/claude-dev.sh` — it launches Claude Code with `--plugin-dir` flags so plugin bundles load directly from disk (no cache). After rebuilding mid-session, run `/reload-plugins` to pick up changes.

## Conventions

- ESM imports use `.js` extensions in TypeScript source.
- Hook code uses `neverthrow` for typed error handling — never throw from a hook.
- Hooks must always exit 0; failures emit `console.error` and produce `{}` on stdout.
- Naming heuristics:
  - Name the responsibility, not the mechanism.
  - Each name should answer a question about its purpose.
  - Specificity gradient: broadest at top, narrowest at leaves.

## TypeScript

- **Strict mode** is enabled — no `any`, no non-null assertions without justification.
- **ESNext target** — use modern JS features (e.g. `using` for resource management).
- **ESM imports** — always use `.js` extensions in import paths.
- **ESLint config** — import from `@toolchain/eslint-config/profile/node`.

## Toolchain

The `toolchain/` workspace mirrors the [`dr-mike`](https://www.npmjs.com/package/dr-mike) published package. When swapping to the published version, replace `@toolchain/eslint-config` → `dr-mike/eslint`, `@toolchain/typescript-config/tsconfig-node22.json` → `dr-mike/tsconfig/node`, `@toolchain/vitest-config` → `dr-mike/vitest`, then delete `toolchain/`.
