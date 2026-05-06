# @marketplace/plugins-claude

Claude Code reference docs and README enforcement. Provides skills that fetch Claude Code documentation from code.claude.com into context on demand, with fuzzy matching, conditional fetch (If-Modified-Since), configurable doc registry, and staleness checks.

## Structure

```
marketplaces/plugins-claude/
├── src/
│   ├── build.ts                              # Build script
│   ├── skills/prime-claude/
│   │   ├── index.ts                          # CLI entry point
│   │   ├── types.ts                          # Type definitions and error classes
│   │   ├── paths.ts                          # Plugin directory and config path constants
│   │   ├── config.ts                         # Load config from .ai/plugins-claude/
│   │   ├── doc-registry.ts                   # Built-in doc registry + config merging
│   │   ├── resolve-docs.ts                   # Doc resolution with fuzzy matching + staleness
│   │   ├── fuzzy-match.ts                    # Levenshtein-based fuzzy matching
│   │   ├── fetch-docs.ts                     # Fetch docs from code.claude.com with caching
│   │   ├── manifest.ts                       # Read/write fetch metadata manifest
│   │   ├── format.ts                         # Format loaded docs for context injection
│   │   └── *.test.ts                         # Colocated tests
│   └── skills/prime-claude-status/
│       ├── index.ts                          # Status table renderer
│       └── index.test.ts                     # Status skill tests
└── skills/
    ├── prime-claude/SKILL.md                 # Skill definition
    ├── prime-claude-status/SKILL.md          # Status skill definition
    └── document-skill/SKILL.md              # Skill documentation generator
```

## Skills

| Skill | Description | Usage |
|-------|-------------|-------|
| `prime-claude` | Load Claude Code reference documentation into context | `/prime-claude [doc-names...]` |
| `prime-claude-status` | Show status of loaded documentation | `/prime-claude-status [check]` |
| `document-skill` | Generate detailed technical documentation for a Claude Code skill | `/document-skill [skill-name]` |

## Available Docs

The `prime-claude` skill fetches documentation from code.claude.com. Built-in docs:

| Doc | Topic |
|-----|-------|
| `hooks` | Hook events, config, JSON formats, exit codes |
| `memory` | Memory management |
| `plugins` | Plugin system |
| `settings` | Settings configuration |
| `skills` | Skill authoring |
| `sub-agents` | Sub-agent usage |

### Fetching docs

```shell
/prime-claude load              # fetch all docs
/prime-claude load hooks        # fetch specific doc
/prime-claude load --force      # re-fetch, ignoring cache
```

### Loading docs into context

Invoke with no arguments to load all docs, or specify one or more names (fuzzy matching supported):

```shell
/prime-claude hooks settings
```

### Checking status

```shell
/prime-claude-status            # show fetch timestamps and enabled state
/prime-claude-status check      # also check remote for updates
```

## Configuration

Optional config at `.ai/plugins-claude/prime-claude.config.json`:

```json
{
  "prime-claude": {
    "docs": {
      "additional": {
        "my-doc": "https://example.com/my-doc.md"
      },
      "disabled": ["memory"]
    }
  }
}
```

- `additional` — add custom doc URLs to the registry
- `disabled` — hide built-in docs from resolution and fetching

## Scripts

| Script | Description |
|--------|-------------|
| `build` | Bundle plugin to `marketplaces/monorepo-marketplace/plugins-claude/` |
| `clean` | Remove Turborepo cache and coverage artifacts |
| `lint` | Run ESLint |
| `test` | Run Vitest |
| `typecheck` | TypeScript type check |

## Build

```shell
pnpm build
```

Outputs the built plugin bundle to `marketplaces/monorepo-marketplace/plugins-claude/`. The marketplace bundle is a generated artifact — edit source here, not in the output directory.
