# @toolchain/eslint-config

Centralized ESLint configuration package providing opinionated, composable profiles for TypeScript monorepo workspaces. Built on ESLint v9 flat config format with `typescript-eslint` for type-aware linting.

## Installation

This is an internal toolchain package. Add it as a dev dependency in your workspace:

```json
{
  "devDependencies": {
    "@toolchain/eslint-config": "workspace:*"
  }
}
```

## Usage

Import and use a profile in your `eslint.config.js`:

### Node.js Profile

For backend services, CLI tools, and Node.js packages:

```javascript
import nodeProfile from '@toolchain/eslint-config/profile/node'

export default nodeProfile
```

**Typical monorepo usage**:

```javascript
import config from '@toolchain/eslint-config/profile/node'

export default [
  ...config,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/throw-new-error': 'off',
    },
  },
]
```

### Svelte Profile

For SvelteKit applications and Svelte component libraries:

```javascript
import svelteProfile from '@toolchain/eslint-config/profile/svelte'

export default svelteProfile
```

**Typical monorepo usage**:

```javascript
import config from '@toolchain/eslint-config/profile/svelte'

import svelteConfig from './svelte.config.js'

export default [
  ...config,
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        svelteConfig,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
]
```

## Profiles

### Node Profile (`/profile/node`)

Includes:
- JavaScript (ESLint recommended + custom rules)
- TypeScript (type-checked + stylistic rules)
- Vitest testing rules
- Base configuration (ECMAScript 2025, TurboRepo)
- Prettier compatibility
- Global ignores (`coverage`, `.svelte-kit`, `.turbo`, `.vercel`, `build`)
- Root `.gitignore` applied via `@eslint/compat`'s `includeIgnoreFile`
- Node.js built-in globals

### Svelte Profile (`/profile/svelte`)

Includes everything in the Node profile, plus:
- Svelte plugin with recommended rules
- Svelte-specific TypeScript parsing
- Browser and Node.js globals
- Rules for `.svelte` file linting

## Bundled Plugins

| Plugin | Purpose |
|--------|---------|
| `@eslint/js` | Core ESLint recommended rules |
| `typescript-eslint` | TypeScript parsing and type-aware rules |
| `@codeforbreakfast/eslint-effect` | Effect library best practices |
| `@vitest/eslint-plugin` | Vitest testing patterns |
| `eslint-plugin-svelte` | Svelte component linting |
| `eslint-plugin-import` | Import/export validation |
| `eslint-plugin-unicorn` | Modern JavaScript patterns |
| `eslint-plugin-perfectionist` | Sorting and ordering |
| `eslint-plugin-prefer-arrow` | Arrow function preference |
| `eslint-plugin-promise` | Promise best practices |
| `eslint-plugin-eslint-comments` | ESLint directive validation |
| `eslint-plugin-turbo` | TurboRepo-aware rules |
| `eslint-config-prettier` | Disable formatting rules |

## Key Rules

### TypeScript

- Type-checked linting with `projectService`
- Consistent type imports (inline style)
- Explicit function return types
- No non-null assertions
- Exhaustive switch statements

### JavaScript

- Function expressions preferred (`func-style: expression`)
- Arrow functions required for callbacks
- `const` preferred with full destructuring
- No empty functions

### Vitest

- Test files must use `.test.ts` pattern
- `test()` at top level, `it()` inside `describe()`
- Assertions required in all tests
- No disabled or focused tests
- Strict equality matchers preferred

### Effect

- Rules from `@codeforbreakfast/eslint-effect` recommended config
- No eta expansion enforced
- Classes and curried calls permitted

## Configuration Structure

```
configs/
├── base.js           # ECMAScript version, TurboRepo, ESLint comments
├── javascript.js     # JS rules + import/unicorn/perfectionist/promise
├── typescript.js     # TS rules + Effect plugin + import resolver
├── svelte.js         # Svelte plugin configuration
├── vitest.js         # Test file rules
├── prettier.js       # Disable conflicting format rules
├── global-ignores.js # Build output, node_modules, etc.
├── turborepo.js      # TurboRepo-specific rules
├── js/               # JavaScript plugin configs
│   ├── eslint-comments.js
│   ├── import.js
│   ├── perfectionist.js
│   ├── prefer-arrow.js
│   ├── promise.js
│   └── unicorn.js
└── ts/               # TypeScript plugin configs
    ├── effect.js
    └── import.js
```

## Extending Profiles

Create a custom configuration by extending a profile:

```javascript
import nodeProfile from '@toolchain/eslint-config/profile/node'

export default [
  ...nodeProfile,
  {
    rules: {
      // Override or add rules
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
```

All ESLint plugin dependencies are managed centrally in this package. Workspaces using these profiles do not need to install ESLint plugins directly.
