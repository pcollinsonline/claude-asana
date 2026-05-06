---
name: update-readme
description: Creates or updates README.md files for this monorepo. Updates the root README, individual package READMEs, or all at once. Use when adding/removing packages, after structural changes, after API changes, or when asked to update documentation.
argument-hint: "[* | root | package-name]"
allowed-tools: mcp__plugin_plugins-dev-tools_dev-tools__readme_prepare, Write, Edit, Read
---

# Update README

## Purpose

READMEs orient developers who are new to a package. They answer "what does this do, how do I use it, and what should I know?" Accuracy matters more than completeness -- a short, correct README is better than a long, stale one. Every claim must be verifiable from source.

## Arguments

| Position | Argument | Required | Description                                                      |
|----------|----------|----------|------------------------------------------------------------------|
| 1        | target   | **Yes**  | `*` for all READMEs, `root` for root only, or a package name/path |

Target: `$ARGUMENTS`

## Constraints

- Only use tools listed in `allowed-tools`. No Bash, no Glob, no Grep.
- Do not rewrite manually-maintained sections (Architecture, Contributing, Known Issues, Migration Guide).
- Preserve existing document structure, tone, and style where content is still accurate.
- Do NOT include a "Dependencies" section in package READMEs.
- **Write vs Edit vs Skip decision:**
  - **Write** -- README is missing or structurally wrong (wrong package name in title, template placeholders present, majority of sections are inaccurate).
  - **Edit** -- README exists and is mostly correct but has stale sections (outdated scripts table, missing new exports, wrong description).
  - **Skip** -- README exists and content is still accurate against current source.

## Workflow

### 1. Gather Metadata

Call `readme_prepare` with `target` from `$ARGUMENTS`. The target argument is required — the caller must specify `root`, `*`, or a package name.

The tool returns a `status` field:

- **`up_to_date`** -- no source changes detected and all READMEs exist. Report "All READMEs are up to date -- no changes needed" and **stop**.
- **`stale`** -- source changes detected. Proceed to step 2 with the returned metadata.
- **`no_history`** -- no git history available. Proceed to step 2 -- treat all packages as needing review.

### 2. Assess Each Package

For each package in `packages` where `hasChanges` is true:

1. Read the `existingReadme` from metadata. If the README is missing, mark the package for **rewrite** and move on.
2. Cross-reference the existing README against the metadata:
   - Does the title match `packageJson.name`?
   - Is the scripts table current against `packageJson.scripts`?
   - Are all public exports from `exports` documented?
   - Are the right sections present for this `packageType` and `category`?
   - Is `packageJson.description` still reflected accurately?
3. When metadata is insufficient to verify a claim (e.g. null description, generic export names, route definitions, env var usage), use `Read` on specific source files to inspect.
4. Decide per package: **skip**, **edit** (targeted fixes to stale sections), or **rewrite** (missing or structurally wrong).

### 3. Update Package READMEs

For each package that needs editing or rewriting:

1. Consult the section catalog in [STANDARDS.md](STANDARDS.md) to determine which sections apply based on the package's characteristics (`packageType`, `category`, `exports`, scripts, source structure).
2. Draft content guided by the section triggers and quality bars. Select sections contextually -- a config package that enforces rules gets a Key Rules section, a plugin package gets Skills/Tools/Agents tables, an API server gets an Endpoints table.
3. For **rewrite**: compose the full README from selected sections. Use `Write`.
4. For **edit**: update only the stale sections. Preserve everything that is still accurate. Use `Edit`.

### 4. Update Root README

If the response includes `root` metadata (non-null):

1. Compare `root.existingReadme` against `root.allPackages`, `root.changedRootFiles`, etc.
2. If `root.changedRootFiles` lists files that could affect the README (e.g. `docker-compose.yml`, `.nvmrc`, `Dockerfile`), use `Read` to inspect their contents and determine what needs updating.
3. If the root README needs updates, draft new content using the root template from [STANDARDS.md](STANDARDS.md).
4. Use `Write` or `Edit` as appropriate.

### 5. Report

List which READMEs were created, updated, skipped, or edited (and which sections changed for edits).

## Documentation Standards

Refer to [STANDARDS.md](STANDARDS.md) for:
- Root README template
- Package README section catalog (when to include each section, quality bar for each)
- Anti-patterns to avoid
- Style rules

## Quality Criteria

- Every export mentioned in the README appears in the actual source
- Every script in the scripts table exists in `package.json`
- Code examples use real import paths and real export names
- No placeholder text, no bracket-wrapped tokens
- Sections are included because the package warrants them, not because a template demands them
- Descriptions are specific enough to distinguish the package from its siblings
