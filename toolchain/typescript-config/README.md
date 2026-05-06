# @toolchain/typescript-config

Shared TypeScript configuration package providing strict, ESM-first tsconfig presets for use across the monorepo.

## Usage

Reference a preset in your workspace `tsconfig.json`:

### Node.js / ESM

For backend packages and apps targeting Node.js with `NodeNext` module resolution:

```json
{
  "extends": "@toolchain/typescript-config/tsconfig-node22.json",
  "compilerOptions": {
    "outDir": "build"
  }
}
```

### Svelte / SvelteKit

For Svelte apps using bundler module resolution and DOM types:

```json
{
  "extends": "@toolchain/typescript-config/tsconfig-svelte.json"
}
```

## Presets

### `tsconfig-node22.json`

| Option | Value |
|--------|-------|
| `target` | `ES2022` |
| `lib` | `ES2023` |
| `module` | `NodeNext` |
| `moduleResolution` | `NodeNext` |
| Plugin | `@effect/language-service` |

### `tsconfig-svelte.json`

| Option | Value |
|--------|-------|
| `target` | `ESNext` |
| `lib` | `DOM`, `DOM.Iterable`, `ESNext` |
| `module` | `ESNext` |
| `moduleResolution` | `Bundler` |

Both presets extend a shared base that enables strict mode throughout.
