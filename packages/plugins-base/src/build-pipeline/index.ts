// ---------------------------------------------------------------------------
// Plugin build orchestrator
//
// Convenience wrapper that runs the three build phases in sequence:
//   1. discoverPlugin()  — scan source tree → PluginBuildPlan
//   2. esbuild.build()   — bundle entry points (+ MCP server if configured)
//   3. emitAssets()       — write manifests, hooks.json, markdown, MCP config
//
// For direct esbuild control, import discoverPlugin() and createBuildConfig()
// individually from this module.
// ---------------------------------------------------------------------------

import { type Metafile, build } from 'esbuild'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { PluginBuildConfig, PluginBuildResult } from './types.js'

import { discoverPlugin } from './discover.js'
import { emitAssets } from './emit-assets.js'
import { createBuildConfig, createMcpBuildConfig } from './esbuild-config.js'

// Re-export public API for consumers
export { discoverPlugin } from './discover.js'
export { collectMarkdownFiles, toKebabCase, toPascalCase } from './discover.js'
export { emitAssets } from './emit-assets.js'
export { createBuildConfig, createMcpBuildConfig } from './esbuild-config.js'
export { rewriteScriptRefs } from './rewrite-script-refs.js'
export type {
  AgentInfo,
  EntryPoint,
  McpServerConfig,
  PackageMetadata,
  PluginBuildConfig,
  PluginBuildPlan,
  PluginBuildResult,
  SkillHookInfo,
  SkillInfo,
} from './types.js'

/**
 * Build a complete Claude Code plugin from source.
 *
 * This is the high-level convenience wrapper. For direct esbuild control,
 * use discoverPlugin() and createBuildConfig() individually.
 *
 * @returns Build result including the esbuild metafile and the discovered plan
 */
export const buildPlugin = async (config: PluginBuildConfig): Promise<PluginBuildResult> => {
  const { distDir } = config

  // Clean output directory
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true })
  }

  // Phase 1: Discover all entry points, skills, agents, MCP
  const plan = discoverPlugin(config)

  // Phase 2a: Bundle plugin entry points with esbuild
  let metafile: Metafile | undefined
  if (plan.entryPoints.length > 0) {
    const esbuildConfig = createBuildConfig(plan, config)
    console.log('Bundling entry points with esbuild...')
    const result = await build(esbuildConfig)
    metafile = result.metafile
    // CJS output needs a package.json to override the parent's "type": "module"
    writeFileSync(
      path.join(distDir, 'dist', 'package.json'),
      JSON.stringify({ type: 'commonjs' }) + '\n',
    )
    console.log(`  \u2713 ${String(plan.entryPoints.length)} entry points bundled`)
  } else {
    console.log('No entry points to bundle.')
  }

  // Phase 2b: Bundle MCP server (separate esbuild invocation)
  const { mcp } = config
  if (plan.mcpEntry && mcp) {
    const mcpConfig = createMcpBuildConfig(config, plan.mcpEntry)
    console.log('Bundling MCP server...')
    await build(mcpConfig)
    console.log('  \u2713 MCP server bundled')
  }

  // Phase 3: Emit manifests, hooks.json, markdown, MCP config
  emitAssets(plan, config)

  console.log(`\nPlugin built at: ${distDir}`)

  return { metafile, plan }
}
