// ---------------------------------------------------------------------------
// Backward-compatible re-export barrel
//
// The build system has been refactored into src/build-pipeline/ as separate modules:
//   - discover.ts      — discoverPlugin() → PluginBuildPlan
//   - esbuild-config.ts — createBuildConfig() → esbuild BuildOptions
//   - emit-assets.ts    — emitAssets() for manifests, markdown, hooks.json
//   - index.ts          — buildPlugin() orchestrator
//
// This file preserves the "./build" package export path so existing
// consumers (import { buildPlugin } from '@packages/plugins-base/build')
// continue to work without changes.
// ---------------------------------------------------------------------------

export {
  buildPlugin,
  collectMarkdownFiles,
  createBuildConfig,
  createMcpBuildConfig,
  discoverPlugin,
  emitAssets,
  rewriteScriptRefs,
  toKebabCase,
  toPascalCase,
} from './build-pipeline/index.js'

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
} from './build-pipeline/types.js'
