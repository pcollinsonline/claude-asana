# ADR-0001: Deterministic plugin builds via content hash

Date: 2026-05-09
Status: Proposed

## Context

Plugin bundles under `marketplaces/monorepo-marketplace/` are committed to git so consumers using the github-source marketplace install without a local build step. The convention "every commit that touches plugin source is paired with a rebuild of the matching bundle" is load-bearing but unenforced. A contributor can edit source, forget `pnpm build`, and ship stale bundles silently.

The `+gitsha` cache-bust at `packages/plugins-base/src/build-pipeline/discover.ts:65-71,334` makes this drift *invisible* to consumers: every commit produces a new gitsha, so Claude Code's version-keyed plugin cache always refreshes — but to a bundle built from an earlier commit's source.

REVIEW.md §5.3 action #1 names this as the largest force multiplier on every other concern in the repo, cited by 4 of 7 reviewers (Build Systems, Distribution, Security, Reliability).

## Decision

Make plugin builds **fully deterministic from source**, then enforce source/bundle parity with a single CI shell check.

1. Replace `getGitSha()` in `packages/plugins-base/src/build-pipeline/discover.ts` with `hashPluginSource(rootDir)` — a stable SHA-256 over the plugin's source tree, with sorted file paths and explicit field separators, excluding `dist/`, `node_modules/`, and `.turbo/`. Identical source produces an identical version string on any machine.
2. Add a single CI workflow at `.github/workflows/ci.yml`, triggered on `pull_request` and `push to main`, that runs `pnpm install --frozen-lockfile && pnpm turbo run build lint test typecheck` and then `git diff --exit-code -- marketplaces/monorepo-marketplace/`. Same workflow for both triggers; no separate main workflow.

The SemVer `+<metadata>` shape is preserved, so Claude Code's cache-invalidation contract is unchanged from the consumer's perspective. The new contract is *stronger*: identical source → identical version (no spurious cache invalidation), source change → distinct version.

## Alternatives Considered

**A. Strict PR gate + bot auto-commits on main.** Keep `+gitsha`; on PRs, exclude `plugin.json` from the diff check; on push to main, a bot rebuilds and commits the bundle delta with `[skip ci]`. Rejected: adds a bot identity, a loop-prevention guard, and branch-protection exceptions for the bot. Solves the symptom (drift) by adding moving parts; the underlying non-determinism (HEAD-sha changing per merge commit) remains.

**C. Strict PR gate + bot opens PR on main.** Same as A on PRs; on main, the bot opens a sync PR for human review instead of pushing. Rejected: requires a human in the loop for what is, by design, mechanical work. If the human forgets, main accumulates pending sync PRs and consumers see stale gitshas.

**B (chosen). Deterministic builds.** Eliminates the question entirely. Identical source → identical bundle on any machine; main cannot drift if PRs cannot drift. One workflow file, one shell check. Removes a moving part instead of adding one.

The `+gitsha` cleverness was doing real work (cache-busting via per-commit version uniqueness). A content hash does the same work better — it ties the version string to the *content* that determines behavior, not to an incidental property of the build environment (HEAD).

## Consequences

**Positive**

- One CI workflow file, one shell check, no bot identity, no `[skip ci]` loop avoidance, no branch-protection exceptions.
- Cache-bust contract strengthened: identical source produces identical version strings, eliminating spurious cache invalidations on no-op rebuilds.
- Bundles are bit-identical across machines, which makes the diff check robust and makes future caching/reproducibility work straightforward.
- Refactor is local — ~10 lines of code in `discover.ts` plus one CI workflow file.

**Negative**

- One-time migration commit needed: rebuild all three plugins so their `plugin.json` version strings switch from gitsha to content hash (3 file changes + any pending bundle deltas).
- Hash sensitivity: any non-excluded file under a plugin's `rootDir` affects the hash. A future contributor adding ad-hoc artifacts (local notes, scratch files) under a plugin directory will change the hash. Acceptable trade-off; the alternative (whitelist of esbuild input globs) duplicates discovery logic.
- Determinism rests on `esbuild` producing byte-identical output for byte-identical input, which is the case today but creates an implicit dependency on that property. `pnpm install --frozen-lockfile` pins the version; revisit if upstream behavior drifts.

## See Also

- [docs/plans/ci-bundle-freshness.md](../plans/ci-bundle-freshness.md) — full plan with workflow YAML, refactor code, file-by-file changes, and end-to-end verification steps.
- [GitHub issue #6](https://github.com/pcollinsonline/claude-asana/issues/6) — implementation tracking.
- REVIEW.md §5.3 action #1 (CI workflow), §4.3 (Build Systems), §4.4 (Distribution & Packaging).
- `packages/plugins-base/src/build-pipeline/discover.ts:65-71,334` — the refactor target.
- `marketplaces/docs/plugins.md` "Plugin caching" section — the consumer-visible contract this decision preserves.
