# Conventional Commits Reference

Enforced by commitlint (`@commitlint/config-conventional`) with project overrides in `commitlint.config.js`.

## Format

```
type(optional scope): subject

optional body

optional footer
```

## Allowed Types

Allowed types are read from `commitlint.config.js` during skill execution (see `SKILL.md`). The single source of truth is the `type-enum` rule in `commitlint.config.js`.

## Subject Rules

- **Mandatory**
- Use imperative, present tense: "add" not "added" nor "adds"
- Do not capitalize the first letter
- No trailing period (`.`)
- Must be **lowercase** (enforced: `subject-case: lower-case`) — no exceptions, including proper nouns, project names, and abbreviations.
  - Project names: write `effect-ts` not `Effect-TS`
  - Abbreviations: write `api` not `API`, `cli` not `CLI`, `ci` not `CI`, `pr`/`pull request` not `PR`/`PRs`, `url` not `URL`
  - Code identifiers: describe the concept instead (e.g., "doc resolver" not `resolveDocs`)

## Scope

- Optional but preferred when the change targets a specific area
- Common scopes in this monorepo: `api`, `db`, `ui`, `monorepo`, `scripts`, `eslint`, `svelte`
- Do not use issue identifiers as scopes

## Body

- Optional; include for non-trivial changes
- Use imperative, present tense
- Explain motivation and contrast with previous behavior
- Separate from subject with a blank line

## Footer

- Optional
- Reference issues by ID
- Breaking changes: start with `BREAKING CHANGE:` followed by a space or two newlines

## Examples

```
feat(api): add user endpoint
```

```
fix(db): resolve connection pool leak
```

```
chore(monorepo): update dependencies
```

```
feat(api): add cli flag for api key rotation
```

```
ci: update pr check workflow for deploy pipeline
```

```
build(turborepo): add typecheck task to pipeline

enable parallel type-checking across all workspaces

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```
