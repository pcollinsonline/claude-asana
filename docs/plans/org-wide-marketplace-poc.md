# Plan: Org-wide Claude Code plugin marketplace (POC)

## Context

Use this monorepo as a proof-of-concept for distributing Claude Code plugins org-wide at the day job. Goals:

- A central **"blessed" catalog** of MCP servers, skills, agents, and hooks that employees can adopt with minimal friction.
- **Visibility and governance** — security/IT can see and constrain what's published.
- **Two-way contribution** — teams can propose plugins back to the central catalog.
- The audience spans technical and non-technical employees, so the install path must work without requiring a full toolchain. A CLI helper for power users is fine as a complement, not a prerequisite.

The current repo distributes via a **`directory`** source (`.claude/settings.json` → `extraKnownMarketplaces` → `directory`) and gitignores built bundles, which only works when the consumer has cloned the repo and run `pnpm build`. That model does not scale to an org. This plan surveys the supported alternatives, evaluates them, and recommends a path for the POC.

> **Note on citations.** The URLs below come from a research subagent that fetched Anthropic docs at `code.claude.com/docs/en/...` and `claude.com/...`. Treat the source-type list and managed-settings claims as **likely accurate but worth a final spot-check** against the live docs before you build. Anywhere I'm not confident, I've flagged it.

---

## Distribution options summary

| Source type | Native? | Build artifacts live where? | Auth | Best fit |
|---|---|---|---|---|
| `directory` | ✅ Yes | Local FS (consumer must build or sync) | FS perms | Today's POC; not scalable |
| `github` | ✅ Yes | Committed to a GitHub repo | SSH key / HTTPS PAT | **Recommended for POC** |
| `git` | ✅ Yes | Committed to any git repo (GitLab, Bitbucket, self-hosted) | SSH / HTTPS creds | Internal git host |
| `url` | ✅ Yes | Static HTTPS endpoint serving `marketplace.json` | Bearer header (`${ENV_VAR}`) | Air-gapped / artifact server |
| `npm` | ✅ Yes | NPM package contents (`marketplace.json` + bundles) | `~/.npmrc` | Catalog distribution; **no version pinning** |
| `file` | ✅ Yes | Path on disk (e.g. `/opt/acme/plugins/`) | FS perms | MDM-pushed deployments |
| `settings` (inline) | ✅ Yes | None — plugins listed inline in settings | N/A | Tiny catalogs, testing |

**Two orthogonal axes** drive the choice:

1. **Where does the catalog (`marketplace.json`) live?** — git repo, HTTPS URL, npm package, local file.
2. **Where do the plugin bundles live?** — same repo, separate repos referenced by the catalog, npm tarball, or built on consumer machines.

These can mix: e.g., a git-hosted catalog can reference plugins from npm or other git repos.

---

## Option A — Git-hosted marketplace (GitHub Enterprise / GitLab) ⭐ recommended

**Shape:** A single private repo containing `.claude-plugin/marketplace.json` plus all plugin bundles (built artifacts committed). Consumers register the marketplace via a `github` or `git` source.

```jsonc
// .claude/settings.json (project) or managed settings (org-wide)
{
  "extraKnownMarketplaces": {
    "acme-internal": {
      "source": { "source": "github", "repo": "acme-corp/claude-plugins" }
    }
  },
  "enabledPlugins": {
    "deploy-kit@acme-internal": true,
    "code-formatter@acme-internal": true
  }
}
```

**Pros**
- **Native, idiomatic** — git is the most documented marketplace source. Tag-based version pinning (`{plugin-name}--v{version}`) is supported only on git sources.
- **Auth is solved** — employees already have GitHub SSO / SSH keys configured. No new credential plumbing.
- **PR-based governance** — contributions, code review, audit trail, branch protection all come for free.
- **Refresh model fits** — the existing `+gitsha` version suffix in `buildPlugin()` already triggers Claude Code's cache refresh on each release.
- **CI builds, repo distributes** — keep source in this monorepo; CI builds and pushes bundles to the distribution repo (or to a `release` branch of the same repo).

**Cons**
- **Bundles must be committed** to the distribution repo (or a release branch). The current `.gitignore` (`marketplaces/monorepo-marketplace/*/`) blocks this — needs a separate distribution repo or branch with its own `.gitignore`.
- **Repo size grows** with every release because each build produces a unique `+gitsha` version. Mitigation: shallow clones (Claude Code already does this), periodic squash, or use git LFS for large bundles.
- **Private repo access** for every employee — fine on GitHub Enterprise, fiddly if some employees lack repo read.

**Effort:** Low. ~1 day to add a CI job that builds and pushes to a `dist` branch, plus a `marketplace.json` rewrite step.

---

## Option B — HTTPS URL marketplace

**Shape:** CI builds bundles, uploads them to an internal artifact server / S3 / static CDN, and publishes `marketplace.json` at a stable HTTPS URL. Consumers register via `url` source with optional bearer token.

```jsonc
{
  "extraKnownMarketplaces": {
    "acme-internal": {
      "source": {
        "source": "url",
        "url": "https://plugins.acme.internal/marketplace.json",
        "headers": { "Authorization": "Bearer ${ACME_PLUGIN_TOKEN}" }
      }
    }
  }
}
```

**Pros**
- **No git access required** — useful if some employee groups (designers, PMs, contractors) don't have git accounts.
- **Atomic releases** — flip the URL to publish; full control over what's served.
- **Works air-gapped** if the artifact server is reachable.

**Cons**
- **Relative paths in plugin sources can break** under URL marketplaces — documented limitation in the troubleshooting section of the discover-plugins page. Each plugin entry probably needs an absolute URL.
- **Token distribution** — every employee needs `ACME_PLUGIN_TOKEN` in their environment. Adds onboarding friction unless pushed via managed settings.
- **You own the infra** — auth, TLS, uptime, retention.
- **No tag-based dependency resolution** — versions are whatever you say they are in `marketplace.json`.

**Effort:** Medium. CI + artifact host + a tiny URL rewriter. Realistic for orgs that already have an internal artifact server (Artifactory, Nexus).

---

## Option C — npm-distributed marketplace

**Shape:** Publish a private npm package (e.g. `@acme/claude-plugins`) containing `marketplace.json` and plugin bundles to an internal npm registry. Consumers register via `npm` source.

```jsonc
{
  "extraKnownMarketplaces": {
    "acme-internal": {
      "source": { "source": "npm", "package": "@acme/claude-plugins" }
    }
  }
}
```

**Pros**
- **Familiar tooling** for engineering orgs — `npm publish`, semver, private registry auth via `~/.npmrc`.
- **Existing internal npm infrastructure** is reusable (Artifactory/Nexus/Verdaccio).
- **Smaller package downloads** than git clones once the registry has tarball compression.

**Cons**
- **No version pinning at the marketplace level** — per the docs, npm sources always fetch the **latest** version. You can't say "everyone use `@acme/claude-plugins@2.3.x`." This is a real governance hole if you want staged rollouts.
- **No tag-based plugin dependency resolution** — that mechanism is git-only.
- **Non-engineering employees** may not have npm configured.
- **Less natural fit** — the docs treat git as the primary path; npm is supported but secondary.

**Effort:** Medium. Mostly worth it only if your org already runs a private npm registry and most consumers are engineers.

---

## Option D — File-based marketplace pushed via MDM

**Shape:** IT pushes `marketplace.json` + bundles to a fixed system path (e.g. `/opt/acme/claude-plugins/`) on managed laptops. Settings reference `file` source, deployed via managed settings.

**Pros**
- **Zero per-user setup** — laptops arrive ready.
- **Works fully offline** post-deploy.
- **Strongest governance** — IT controls the bytes on disk.

**Cons**
- **Requires MDM** (Jamf, Intune, etc.) and IT involvement.
- **Slow update loop** — pushing bundle updates to fleets is slower than `git pull`.
- **Heavy for a POC** — overkill unless your org already deploys software this way.

**Effort:** High. Right answer for a regulated environment, wrong answer for a POC.

---

## Cross-cutting: managed settings for org-wide enforcement

Independently of source type, **managed settings** (`/etc/claude-code/managed-settings.json` on Linux, `/Library/Application Support/ClaudeCode/managed-settings.json` on macOS, HKLM on Windows, or pushed via the Claude for Teams/Enterprise admin console) take **precedence over user and project settings** and let you:

- Pre-register `extraKnownMarketplaces` org-wide so employees don't run `/plugin marketplace add`.
- Pre-enable plugins via `enabledPlugins`.
- Use `strictKnownMarketplaces` (whitelist) and `blockedMarketplaces` (blacklist) to constrain which catalogs employees can install from.

For the POC this is optional, but it's the lever that turns "blessed catalog" into actually-enforced policy. Worth piloting once one of A/B/C above works.

---

## Cross-cutting: optional CLI helper

A small CLI (e.g. `acme-plugins init`) is worth adding for the technical-user audience even though it's not the primary install path. It would:

1. Detect the consumer's `.claude/settings.json` (project or user scope).
2. Merge in `extraKnownMarketplaces` and `enabledPlugins` for `acme-internal`.
3. Run `claude plugin install` or print the next steps.

For non-technical employees, the same effect is achieved by having IT push managed settings, or by giving them a one-line "paste this JSON into `.claude/settings.json`" snippet.

---

## Decisions locked in

- **Source type: `github`.** Org uses GitHub Enterprise; POC will use a **public GitHub repo** owned by you. Same source type works for both, so the migration from POC to GHE is a one-line `repo` change in `extraKnownMarketplaces`.
- **No auth required for the POC** — public repo means consumers (you, and anyone you share the snippet with) can install with no credentials. When you migrate to GHE, employees use their existing GitHub SSO / SSH setup; nothing new to plumb.
- **Audience: you + a few teammates at the day job.** Onboarding via paste-able JSON snippet and a short README in the dist repo. **Skipping the CLI helper for phase 1** — revisit if the snippet feels rough during the pilot.
- **Dist target: TBD between two reasonable shapes** (see [Distribution shape](#distribution-shape) below).

## Distribution shape

A git-hosted marketplace can take three shapes. There is **no documented "best practice"** here in Anthropic's docs; this is a judgment call.

| Shape | Source + bundles location | Pro | Con |
|---|---|---|---|
| **Single repo, bundles committed** | This monorepo, with `marketplaces/monorepo-marketplace/` un-gitignored | Simplest. One repo, one PR, one truth. Matches what most public Claude Code marketplace examples do. | Mixes source and build output; large diffs on every release; CI must commit back to the repo it was triggered from. |
| **Single repo, `release` orphan branch** | This monorepo. `main` has source, `release` has bundles. | One repo, clean branch separation, CI pushes only to `release`. The `github` source can target `ref: "release"`. | Slightly less obvious to outside readers; branch-protection rules need to allow CI writes. |
| **Separate dist repo** | This monorepo for source, `<handle>/claude-plugins-dist` for bundles | Cleanest permission model — useful at orgs where consumers have read-only access to artifacts but not source. | Two repos to manage. Cross-repo CI auth (PAT or app token). Overkill for a public-repo POC. |

**Honest evidence:** Public Claude Code marketplaces (including Anthropic's own examples) tend to be **single repo with bundles committed**. The separate-dist-repo pattern is borrowed from corporate practices around artifact distribution; it's reasonable but not idiomatic to this ecosystem.

**Recommendation for the POC:** **Single repo, bundles committed** — simplest, fastest to validate, and it's what looks normal to anyone who's installed a Claude Code marketplace before. Eventual migration to GHE can either keep this shape or split into a dist repo *if* org permission boundaries demand it; that decision is independent of the source-type choice and can be made later.

This requires un-gitignoring the marketplace bundle directories in this repo (or in a fork/clone meant for distribution). The current `.gitignore` rule `marketplaces/monorepo-marketplace/*/` would need to be removed or scoped.

## Recommendation

**For the POC: Option A (git-hosted marketplace) + project-level `.claude/settings.json` for pilots, then layer managed settings once it sticks.**

Why:
- Lowest friction relative to where the codebase already is — `buildPlugin()` already produces unique `+gitsha` versions that play well with git distribution.
- Best alignment with documented Claude Code patterns (tag-based versioning, native auth).
- Engineering teams (the most likely first adopters at most companies) already have git access.
- Easy upgrade path: once the git-hosted marketplace is real, layering managed settings + `strictKnownMarketplaces` for fleet-wide rollout is additive, not a rewrite.

Reserve **Option B (URL)** as the second choice if a meaningful fraction of consumers don't have git access, or if you need atomic rollouts behind a URL flip. Skip **C (npm)** unless you have a strong existing npm-only infra story; the lack of version pinning is a real problem for staged rollouts. Save **D (MDM)** for when the POC graduates.

---

## POC implementation outline (Option A — single repo, bundles committed)

The work all happens in **this monorepo**. No second repo, no orphan branch.

1. **Un-gitignore the marketplace bundle directories.** Edit `.gitignore` to remove (or scope down) the rule `marketplaces/monorepo-marketplace/*/` so built plugin bundles are committed. The `.claude-plugin/marketplace.json` registry is already committed; this just adds the bundles next to it.

2. **Pick a marketplace name.** The current `marketplace.json` calls it `monorepo-marketplace`. For the POC, that's fine, or rename to something more descriptive (e.g. `<your-handle>-plugins`). Whatever you pick is the suffix consumers will use in `enabledPlugins` (e.g. `plugins-utility@<name>`).

3. **Add a CI workflow** in this monorepo (`.github/workflows/build-and-commit-bundles.yml`) that, on push to `main`:
   - runs `pnpm install && pnpm build`
   - if `marketplaces/monorepo-marketplace/` has any diff, commits with a `[skip ci]`-style guard and pushes back to `main`
   - optionally creates per-plugin tags (`plugins-utility--v1.2.3`) so consumers can later use dependency version pinning

   Alternative if "CI commits to main" feels wrong: do the build locally and commit by hand for the POC, and set up CI later. Lower magic for a small audience.

4. **Documented consumer onboarding** — add a section to the existing root `README.md` with the paste-able JSON snippet for `.claude/settings.json`:
   ```jsonc
   {
     "extraKnownMarketplaces": {
       "<marketplace-name>": {
         "source": {
           "source": "github",
           "repo": "<your-handle>/<this-repo>",
           "path": "marketplaces/monorepo-marketplace"
         }
       }
     },
     "enabledPlugins": {
       "plugins-utility@<marketplace-name>": true,
       "plugins-claude@<marketplace-name>": true,
       "plugins-dev-tools@<marketplace-name>": true
     }
   }
   ```
   The `path` field tells Claude Code where in the repo to find `.claude-plugin/marketplace.json`. This avoids needing a separate repo just to host the registry at the root.

5. **Pilot with a few teammates** — share the snippet, have them paste it, run `claude`, and confirm `/plugin list` shows the plugins. Iterate on which ones are blessed.

6. **CLI helper — deferred.** Will revisit only if the JSON snippet onboarding proves friction-heavy during the pilot.

---

## Phase 2 — org-wide enforcement at the day job

Once the POC validates and you have buy-in to roll out across GitHub Enterprise, layer on **managed settings**. The mechanics depend on what your org uses to deliver Claude Code:

### 2.1 If on Claude for Teams or Enterprise

Push managed settings via the **Claude.ai admin console** (`https://claude.com/settings/admin` — verify the URL with your admin). Settings are delivered to each authenticated Claude Code instance at session start and refreshed hourly during active sessions; no endpoint software is required.

Recommended initial managed-settings payload (deliberately permissive — no whitelist enforcement):

```jsonc
{
  "extraKnownMarketplaces": {
    "acme-internal": {
      "source": {
        "source": "github",
        "repo": "acme-corp/claude-plugins",
        "path": "marketplaces/monorepo-marketplace"
      }
    }
  },
  "enabledPlugins": {
    "plugins-utility@acme-internal": true,
    "plugins-claude@acme-internal": true,
    "plugins-dev-tools@acme-internal": true
  }
}
```

- `extraKnownMarketplaces` registers the catalog org-wide; employees do not run `/plugin marketplace add`.
- `enabledPlugins` pre-activates the blessed set so onboarding requires zero JSON editing for non-engineers.

Managed settings take precedence over project (`.claude/settings.json`) and user (`~/.claude/settings.json`) settings, so once deployed the registration and pre-enabled plugins cannot be removed by a curious user. **Employees remain free to install additional non-blessed marketplaces** — that's intentional for the early phase.

### Future consideration — `strictKnownMarketplaces` whitelist (not phase 2)

`strictKnownMarketplaces: ["acme-internal", ...]` is a managed-settings lever that **forbids employees from installing marketplaces outside the approved list**. We are explicitly **not** turning this on at phase 2. Reasons to revisit later:

- Security review demands a hardened posture.
- Adoption is high enough that an exception process for non-blessed catalogs is cheaper than an open policy.
- A specific incident (a plugin from an untrusted catalog causes an issue) makes the case.

When that day comes: whitelist `acme-internal` plus any other catalogs you've vetted, and document an exception path for teams that legitimately need additional sources.

### 2.2 If self-hosted (Bedrock / Vertex / Foundry / no Teams license)

Push the same JSON via MDM (Jamf / Intune / Workspace ONE / equivalent) to the platform-specific managed-settings file:

| OS | Path |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux / WSL | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` (or HKLM registry equivalent) |

> ⚠️ **Verify these paths in the live admin docs before relying on them.** They were reported by a research subagent and not personally re-verified.

The MDM route adds operational overhead (you own the deploy cadence), but works without a Teams/Enterprise license and applies to all Claude Code provider configurations.

### 2.3 Phased rollout suggestion

1. **Pilot (managed-settings off)** — POC repo + JSON snippet for 3–5 friendly teammates. Validate the install loop and refresh cycle. Cost: zero IT involvement.
2. **Soft launch (managed settings on, no whitelist)** — IT pushes `extraKnownMarketplaces` + `enabledPlugins` org-wide. Employees still free to install other marketplaces. Cost: one IT ticket.
3. **(Future, deliberately deferred) Hardened (`strictKnownMarketplaces` on)** — restrict to the blessed catalog. Not in scope for this plan; tracked above as a future consideration.

### 2.4 IT/security coordination checklist

- Confirm Claude Code version requirement — managed settings + `strictKnownMarketplaces` need a recent enough release. Pin the minimum version.
- Decide who owns the dist repo at the org (a platform team / DevTools team typically).
- Decide PR-review policy for the catalog: who can publish a new "blessed" plugin?
- Document an **exception path** for teams that need a non-blessed marketplace temporarily.

### Files this monorepo would need to touch

- `.gitignore` — remove or scope down `marketplaces/monorepo-marketplace/*/` so built bundles can be committed alongside `.claude-plugin/marketplace.json`.
- `marketplaces/monorepo-marketplace/.claude-plugin/marketplace.json` — confirm the `name`, `description`, and `owner` fields read sensibly to an external consumer.
- `README.md` (root) — add a "Consuming this marketplace" section with the paste-able JSON snippet.
- `.github/workflows/build-and-commit-bundles.yml` (optional, new) — auto-build and auto-commit on push to `main`. Skip for the first iteration; do builds locally and commit by hand until the cadence justifies CI.
- No changes needed to `marketplaces/packages/plugins-base/src/build-pipeline/` — the existing `buildPlugin()` and `+gitsha` versioning already produce dist-ready output.

---

## Verification

End-to-end test before declaring the POC successful:

1. **Local dry run.** From a scratch directory outside this monorepo, register the public repo as a marketplace via the snippet above (with the `path` field pointing at `marketplaces/monorepo-marketplace`), run `claude`, and confirm `/plugin list` shows `plugins-utility`, `plugins-claude`, `plugins-dev-tools` as installable. Install one and exercise an MCP tool from it.
2. **Cache refresh.** Make a trivial change in this monorepo, rebuild, commit and push the new bundles, then in the consumer environment confirm Claude Code picks up the new `+gitsha` version on next session start (or after `/reload-plugins`).
3. **Public-access sanity.** Verify a friend or teammate can install from your public repo with no special credentials.
4. **Phase 2 layer (if attempted).** Push the marketplace via managed settings on one test machine, then verify `extraKnownMarketplaces` is set without any project-level config and that consumers retain the ability to add other marketplaces.

---

## Citations

The research below was gathered by a subagent fetching Anthropic's published Claude Code documentation. **Not personally re-verified** — please spot-check before relying on any specific claim.

- Marketplace registration and source schema: `https://code.claude.com/docs/en/settings.md`
- Marketplace creation: `https://code.claude.com/docs/en/plugin-marketplaces.md`
- Plugin discovery and installation: `https://code.claude.com/docs/en/discover-plugins.md`
- Plugin dependency / version constraints (tag format `{plugin-name}--v{version}`): `https://code.claude.com/docs/en/plugin-dependencies.md`
- Managed settings, settings precedence, `strictKnownMarketplaces`, `blockedMarketplaces`, enterprise distribution: `https://code.claude.com/docs/en/admin-setup.md`
- Claude for Teams/Enterprise admin console (managed-settings UI): `https://claude.com/settings/admin`

### Confidence flags

- ✅ **High confidence** — Six source types exist (`directory`/`file`, `github`, `git`, `url`, `npm`, `settings`); managed settings override project settings; `extraKnownMarketplaces` and `enabledPlugins` are real keys.
- ⚠️ **Worth re-verifying before building** — exact JSON shape of the `url` source's `headers` field with `${ENV_VAR}` interpolation; whether `strictKnownMarketplaces` is the precise key name; whether the npm source can in fact be version-pinned through some mechanism the agent missed.
- 🔎 **Undocumented but plausible** — relative-path limitations under `url` sources; behavior of cross-marketplace dependencies. If you go down those paths, prototype before committing.

---

## Resolved questions

1. **Git host** — GitHub Enterprise (eventually); public personal repo for the POC.
2. **Pilot audience** — you + a few teammates at the day job; paste-able JSON snippet for onboarding; CLI helper deferred.
3. **Dist shape** — single repo with bundles committed (this monorepo), using the `path` field on the `github` source to point at `marketplaces/monorepo-marketplace`.
4. **Phase 2** — managed settings to register the marketplace org-wide; **deliberately permissive — no `strictKnownMarketplaces` whitelist**. The whitelist is documented as a future-only consideration.
5. **Specific licensing route** at the day job (Teams/Enterprise vs Bedrock/Vertex/Foundry) is the one detail to confirm before phase 2 work begins; it does not block the POC.
