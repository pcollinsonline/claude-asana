# Plan: Bundle-freshness CI for `claude-asana`

## Context

This monorepo is a github-source Claude Code plugin marketplace. Plugin source lives under `marketplaces/plugins-*/src/` and compiles via `pnpm build` into bundles under `marketplaces/monorepo-marketplace/<plugin-name>/`. The bundles are **committed to git** (the global `dist/` ignore is overridden in `.gitignore` for that subtree) so consumers can install via the `github` source without a local build step — the bundles in git are what consumers actually run.

The convention is therefore load-bearing: every commit that touches plugin source must be paired with a rebuild of the matching bundle directory. Today nothing enforces it. A contributor can edit `marketplaces/plugins-*/src/`, forget to run `pnpm build`, and ship stale bundles silently. The `+gitsha` cache-busting at `packages/plugins-base/src/build-pipeline/discover.ts:65-71,334` makes this *invisible*: every commit produces a new gitsha, so consumers' caches refresh — but to a bundle built from an earlier commit's source.

REVIEW.md §5.3 action #1 names "no CI" as the largest force multiplier on every other concern in the repo, cited by 4 of 7 reviewers. This plan closes that gap.

The framing matters: a developer forgetting to build is a process breakdown, not a CI concern. CI's job is to enforce *outcome* invariants on `main`, not babysit individual developers. The chosen approach therefore makes builds **fully deterministic from source**, then enforces "main is internally consistent" with one shell check on every PR.

---

## Goals

1. **Eliminate source/bundle drift** — `main` is always the case where the committed bundle is bit-identical to a fresh build of the committed source.
2. **Keep the github-source consumer experience** — bundles stay committed; install remains a settings.json paste with no build step.
3. **Minimize moving parts** — one CI workflow file, no bot identities, no auto-commit loops, no remote cache wiring (this iteration).
4. **Preserve the cache-bust property** — Claude Code's plugin cache must still refresh when source changes; identical source must still produce identical bundles.

---

## Approach

Two changes, in order. Both ship together.

### 1. Make builds deterministic

Replace the HEAD-sha stamp in `packages/plugins-base/src/build-pipeline/discover.ts:65-71` with a content hash over the plugin's source tree. Same source → same bundle, byte-for-byte, regardless of when, where, or by whom the build is run.

Replace `getGitSha()`:

```typescript
// Old
const getGitSha = (): string => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
```

With `hashPluginSource(rootDir)`:

```typescript
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Stable content hash of every file the build pipeline consumes for this plugin.
 * Identical input tree → identical hash on any machine, any time.
 */
const hashPluginSource = (rootDir: string): string => {
  const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo'])
  const files: string[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full)
      } else {
        files.push(full)
      }
    }
  }

  try {
    walk(rootDir)
  } catch {
    return 'unknown'
  }

  const hash = createHash('sha256')
  for (const file of files.sort()) {
    hash.update(path.relative(rootDir, file))
    hash.update('\0')
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 8)
}
```

Update the call site at `discover.ts:334`:

```typescript
version: `${pkgRaw.version}+${hashPluginSource(rootDir)}`,
```

Why this preserves the cache-bust contract (per `marketplaces/docs/plugins.md` Plugin caching section): the SemVer `+<metadata>` shape is unchanged; any source-affecting edit changes the hash and thus the version string, which Claude Code's version-keyed plugin cache uses to evict and re-pull. Identical source now produces an identical version string, which is the *more* correct semantic — there's no reason for a bit-identical bundle to claim to be a different version.

Stable ordering and explicit field separators (`\0`) prevent collision attacks via filename concatenation. The hash lives entirely in Node's `crypto` module — no new dependencies.

### 2. Add a single CI workflow

New file `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  build-and-verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: 'package.json'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build, lint, test, typecheck
        run: pnpm turbo run build lint test typecheck

      - name: Verify committed bundles match source
        run: |
          if ! git diff --exit-code -- marketplaces/monorepo-marketplace/; then
            echo ""
            echo "ERROR: marketplaces/monorepo-marketplace/ differs from a fresh build."
            echo ""
            echo "To fix, run locally:"
            echo "  pnpm install --frozen-lockfile && pnpm build"
            echo "  git add marketplaces/monorepo-marketplace"
            echo "  git commit -m 'chore: rebuild plugin bundles'"
            echo ""
            exit 1
          fi
```

Notes on the workflow:

- **Triggers** — `pull_request` against `main` and `push` to `main`. The push trigger covers admin-merge / direct-push edge cases.
- **Concurrency** — cancels superseded PR runs; serializes `main` runs.
- **`pnpm/action-setup@v4`** with no `version` field reads the `packageManager` pin from root `package.json`.
- **`node-version-file: 'package.json'`** uses the `engines.node` constraint already in the repo (`>= 22`).
- **No remote Turbo cache** — local `.turbo/` cache is sufficient for this iteration; remote cache wiring is deferred (see Out of scope).
- **No separate main workflow** — with deterministic builds, `main` cannot drift if PRs cannot drift. The defensive auto-commit-on-main pattern is unnecessary.

### Migration commit

A one-time rebuild commit lands all three plugins under `marketplaces/monorepo-marketplace/` with the new content-hash version stamp. The diff is three `plugin.json` version changes plus whatever bundle deltas were already pending.

---

## Files to touch

| File | Change |
|---|---|
| `packages/plugins-base/src/build-pipeline/discover.ts` | Replace `getGitSha` (lines 64-71) with `hashPluginSource(rootDir)`; update call site (line 334). Update the leading `execSync` import block as needed. |
| `.github/workflows/ci.yml` | **New file** — full workflow above. |
| `marketplaces/docs/plugins.md` (Plugin caching section, ~lines 494-501) | Update prose: "every build produces a distinct version" → "every source change produces a distinct version (identical source produces an identical version)." |
| `marketplaces/docs/plugins.md` (Gitignore strategy section, ~line 453) | Remove the "Mitigation (planned): a future CI workflow" sentence — replace with a one-liner referencing this CI workflow. |
| `marketplaces/monorepo-marketplace/<plugin>/.claude-plugin/plugin.json` (×3) | Migration commit: regenerated version strings using the content hash. |
| `marketplaces/monorepo-marketplace/<plugin>/dist/**` (×3) | Migration commit: any bundle deltas surfaced by running `pnpm build` after the refactor. |

---

## Verification

End-to-end checks before declaring this done:

1. **Determinism — same machine.** On a clean checkout: `pnpm install --frozen-lockfile && pnpm build && git diff --exit-code marketplaces/monorepo-marketplace/`. Silent. Repeat without changing any source: still silent.
2. **Determinism — different machine.** Re-run step 1 in a fresh worktree on a different host (or in CI). Same bundle digests across hosts.
3. **Drift detection — local.** Edit any file under `marketplaces/plugins-*/src/`. Run `pnpm build`. Observe a non-empty diff under `marketplaces/monorepo-marketplace/<plugin-name>/`.
4. **CI happy path.** Open a PR that updates source and includes a fresh bundle rebuild. CI passes all steps including the diff check.
5. **CI red path.** Open a PR that touches plugin source without rebuilding bundles. CI fails on the "Verify committed bundles match source" step with the remediation message.
6. **Cache-bust property.** Make a trivial change in `marketplaces/plugins-utility/src/`, rebuild, commit, push, then in a consumer environment confirm Claude Code picks up the new version string on next session start (or after `/reload-plugins`). Then make a no-op rebuild on the same commit — version string unchanged, no spurious cache thrash.

---

## Out of scope

Named explicitly so future readers know what *isn't* in this plan:

- **Skill ↔ agent `tools` sync check** (REVIEW.md §5.3 #3) — separate plan + issue. The mechanism (parsing skill frontmatter and the corresponding agent's `tools`) is ~50 lines of TypeScript and warrants its own design conversation. Natural follow-up; same workflow file can host it later.
- **Turbo remote cache** — neither Vercel Remote Cache (`TURBO_TOKEN`/`TURBO_TEAM`) nor a GitHub Actions cache for `.turbo/` is wired up. Revisit when CI minutes start hurting.
- **Tag-based version pinning** (REVIEW.md §4.4 Major #2) — `{plugin-name}--v{version}` tag publishing remains future work.
- **Server-side `.env` reject in `commit_execute`** (REVIEW.md §5.3 #5).
- **Dependency closure audit of bundled hooks** (REVIEW.md §4.5 open question 1).
- **Other §5.3 actions** (CI workflow #1 is the only one this plan addresses).

---

## Resolved decisions (from clarifying conversation)

1. **Plan filename** — `ci-bundle-freshness.md` (matches the descriptive long-name precedent set by `org-wide-marketplace-poc.md`).
2. **Bundle policy** — deterministic builds remove the question. PRs and `main` follow the same rule because identical source produces an identical bundle on any machine.
3. **Turbo remote cache** — skip for this iteration. Listed in Out of scope.
4. **Scope** — bundle-freshness only. Skill ↔ agent sync is named as the natural follow-up.
5. **Approach** — Option B (deterministic builds via content hash) chosen over Option A (auto-commit on main) because removing a moving part is preferred over adding one. The `+gitsha` cleverness is doing real work; a content hash does the same work better.

---

## Open questions

None blocking. Things worth keeping an eye on once this lands:

1. **Bundle determinism in practice** — esbuild is deterministic given identical inputs and config, but version drift in `esbuild` itself between local and CI environments could surface as bundle deltas. The `pnpm install --frozen-lockfile` step pins the version; revisit if drift appears.
2. **Hash sensitivity** — the proposed `hashPluginSource` walks every non-excluded file. If a future contributor adds an unrelated artifact under a plugin's `rootDir` (e.g. local notes), the hash will change. Acceptable trade-off; the alternative (whitelist of esbuild input globs) duplicates discovery logic.
3. **Migration noise** — the migration commit's diff includes the version change in three `plugin.json` files plus any bundle deltas that had already accumulated. Worth a clean commit message explaining both.

---

## Citations

- REVIEW.md §3 (ground-truth verification), §4.3 (Build Systems), §4.4 (Distribution & Packaging), §5.1 (cross-cutting themes), §5.3 #1 (CI workflow action item).
- `marketplaces/docs/plugins.md` — Build pipeline, Marketplace, Gitignore strategy, Plugin caching sections.
- `packages/plugins-base/src/build-pipeline/discover.ts:65-71,334` — current `getGitSha` implementation and call site.
- `docs/plans/org-wide-marketplace-poc.md` — section structure mirrored here.
