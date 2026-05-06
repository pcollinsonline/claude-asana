# @toolchain/vitest-config

Shared Vitest configuration for the monorepo. Provides a pre-configured `defineConfig` with v8 coverage enabled and sensible defaults for TypeScript packages.

## Usage

In your workspace `vitest.config.ts`:

```typescript
import { defineConfig } from '@toolchain/vitest-config'

export default defineConfig({})
```

Override specific options as needed:

```typescript
import { defineConfig, mergeConfig } from '@toolchain/vitest-config'

export default mergeConfig(defineConfig({}), {
  test: {
    environment: 'jsdom',
  },
})
```

## Defaults

| Option | Value |
|--------|-------|
| `test.include` | `src/**/*.test.ts` |
| `test.globals` | `true` |
| `test.passWithNoTests` | `true` |
| `coverage.provider` | `v8` |
| `coverage.enabled` | `true` |
| `coverage.all` | `true` |
| `coverage.reportsDirectory` | `coverage` |
| `coverage.reporter` | `text`, `json`, `html` |

## Exports

| Export | Description |
|--------|-------------|
| `defineConfig` | Re-exported from `vitest/config` — pre-wired with monorepo defaults |
| `mergeConfig` | Re-exported from `vitest/config` for layering overrides |
