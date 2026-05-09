# Turbo cache

Reference notes on what Turborepo's caching does and the options for using it in this monorepo. Captured during the CI bundle-freshness planning conversation; written for someone deciding whether to wire up caching now or later.

## What Turbo cache does

[Turborepo](https://turbo.build/repo) (`turbo.json` at the repo root) is the build orchestrator. It hashes each task's inputs — source files, declared dependencies, environment variables, and the task config itself — and stores the task's output keyed on that hash. If a later run produces the same input hash, Turbo replays the cached output instead of re-running the task.

The practical effect: `pnpm turbo run build lint test typecheck` becomes effectively instant on a clean cache hit.

The shape of an input fingerprint comes from:

- Files matched by the task's `inputs` glob (or the package's whole tree if `inputs` is unset)
- The task's `dependsOn` graph (so a downstream task busts when an upstream task's output would change)
- Env vars listed in `globalPassThroughEnv` / `passThroughEnv` (this repo passes only `CLAUDE_PLUGIN_DATA` through — see `turbo.json:3`)

If any of those change, the hash changes, and Turbo re-runs the task.

## Two cache layers

Turbo writes to a **local cache** by default — the `.turbo/` directory next to each package. This is on automatically; nothing to configure.

A **remote cache** is opt-in. It's a server (hosted by Vercel for the default, or self-hosted) that stores cache entries keyed on the same hashes. Turbo authenticates via two env vars:

- `TURBO_TOKEN` — auth token for the cache server
- `TURBO_TEAM` — namespace (Vercel team slug) for the entries

When both are set, Turbo reads from and writes to the remote in addition to `.turbo/`. Cache entries are shared across whoever has the same token + team.

## Options for CI in this repo

| Option | What's shared | Cost | Setup |
|---|---|---|---|
| **No cache** | Nothing — CI rebuilds from scratch every run | ~30–60s wasted per run (small monorepo, three plugins) | Zero |
| **Vercel Remote Cache** | Developer laptops ↔ CI ↔ everyone's CI runs | Free tier exists; paid for orgs. External dependency on Vercel. | Create Turbo team, generate token, add `TURBO_TOKEN`/`TURBO_TEAM` GitHub secrets, pass through `env:` in workflow |
| **GitHub Actions cache** | CI runs share cache with each other (not with laptops) | Free; lives in github.com | One `actions/cache` step keyed on lockfile + `.turbo/` directory; `setup-node` already handles the pnpm store separately |

## Decision context

For the bundle-freshness CI (see `docs/plans/ci-bundle-freshness.md`), caching only speeds up the build/lint/test/typecheck portion. The drift check itself (`git diff --exit-code -- marketplaces/monorepo-marketplace/`) is just a filesystem comparison — it doesn't depend on caching. With three small plugins, uncached CI is probably under a minute. The decision is mostly "invest setup time now, or later."

**Skipped for this iteration** of the CI POC. Revisit when CI minutes start hurting or when developer iteration time on `pnpm build` becomes painful enough to want laptop ↔ CI cache sharing.

When the time comes:

- **GitHub Actions cache** is the cheapest middle ground — free, no external service, no secrets. Reasonable default for a public personal repo.
- **Vercel Remote Cache** pays off when contributors regularly trigger redundant builds across machines. The setup is one Vercel team + two GitHub secrets, but it's an external dependency to remember.

## See also

- `turbo.json` — task topology, `globalPassThroughEnv`
- [Turborepo caching docs](https://turbo.build/repo/docs/crafting-your-repository/caching)
- [Turborepo remote caching docs](https://turbo.build/repo/docs/core-concepts/remote-caching)
- `docs/plans/ci-bundle-freshness.md` — the CI plan that explicitly defers remote-cache wiring
