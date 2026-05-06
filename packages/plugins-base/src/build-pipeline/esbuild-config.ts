// ---------------------------------------------------------------------------
// esbuild configuration factories
//
// Pure data transformations: PluginBuildPlan → esbuild BuildOptions.
// No side effects, no filesystem writes.
// ---------------------------------------------------------------------------

import type { BuildOptions, Plugin as EsbuildPlugin } from 'esbuild'

import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { PluginBuildConfig, PluginBuildPlan } from './types.js'

// ---------------------------------------------------------------------------
// Shared esbuild plugin: strip shebangs
// ---------------------------------------------------------------------------

/** Strip #!/usr/bin/env tsx shebangs from TypeScript source files before bundling. */
const stripShebang: EsbuildPlugin = {
  name: 'strip-shebang',
  setup: (builder) => {
    builder.onLoad({ filter: /\.ts$/ }, (args) => {
      const source = readFileSync(args.path, 'utf8')
      if (source.startsWith('#!')) {
        return { contents: source.replace(/^#!.*\n/, ''), loader: 'ts' }
      }
      return null
    })
  },
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an esbuild BuildOptions for the plugin's main entry points
 * (hooks, skill scripts, skill hooks, agent scripts).
 *
 * Enables metafile generation for post-build verification.
 */
export const createBuildConfig = (
  plan: PluginBuildPlan,
  config: PluginBuildConfig,
): BuildOptions => ({
  bundle: true,
  entryPoints: plan.entryPoints.map((e) => ({ in: e.in, out: e.out })),
  format: 'cjs',
  metafile: true,
  minify: false,
  outdir: path.join(config.distDir, 'dist'),
  platform: 'node',
  plugins: [stripShebang],
  sourcemap: false,
  target: 'node22',
})

/**
 * Create an esbuild BuildOptions for bundling an MCP server.
 *
 * The MCP server is a separate esbuild invocation because it uses
 * `outfile` (single output) rather than `outdir` (multiple outputs).
 */
export const createMcpBuildConfig = (
  config: PluginBuildConfig,
  mcpEntry: string,
): BuildOptions => ({
  bundle: true,
  entryPoints: [mcpEntry],
  format: 'cjs',
  metafile: true,
  outfile: path.join(config.distDir, 'dist', 'mcp', 'server.js'),
  platform: 'node',
  target: 'node22',
})
