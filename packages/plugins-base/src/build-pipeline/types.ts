// ---------------------------------------------------------------------------
// Build system types
//
// These types form the contract between the three build phases:
//   discover  →  PluginBuildPlan  →  esbuild-config / emit-assets
// ---------------------------------------------------------------------------

import type { Metafile } from 'esbuild'

// ---------------------------------------------------------------------------
// Config — what the consumer provides
// ---------------------------------------------------------------------------

/** Configuration for an MCP server bundled alongside the plugin. */
export interface McpServerConfig {
  /**
   * Entry point relative to rootDir.
   * @default 'src/mcp/server.ts'
   */
  entry?: string
  /** MCP server name used as the key in .mcp.json (e.g. 'dev-tools'). */
  name: string
}

/** Top-level configuration passed to buildPlugin() or discoverPlugin(). */
export interface PluginBuildConfig {
  /** Absolute path to the marketplace output directory. */
  distDir: string
  /** Maps hook directory names to async flag — when true, hook runs in background. */
  hookAsync?: Record<string, boolean>
  /** Maps hook directory names to their CLI flags (if any). */
  hookFlags?: Record<string, string>
  /** Maps hook directory names to matcher regex strings for hooks.json. */
  hookMatchers?: Record<string, string>
  /**
   * MCP server configuration. When provided, buildPlugin() bundles the MCP
   * server entry point and generates .mcp.json in distDir.
   * Omit entirely if the plugin has no MCP server.
   */
  mcp?: McpServerConfig
  /** Absolute path to the plugin source root (where package.json lives). */
  rootDir: string
}

// ---------------------------------------------------------------------------
// Discovery output — the intermediate build plan
// ---------------------------------------------------------------------------

/** A single esbuild entry point (input → output path). */
export interface EntryPoint {
  /** Absolute path to the source .ts file. */
  in: string
  /** Relative output path (without extension) — used as esbuild `out`. */
  out: string
}

/** A hook declared in a skill's SKILL.md frontmatter. */
export interface SkillHookInfo {
  /** Absolute path to the hook entry file. */
  entry: string
  /** PascalCase event name (e.g. 'PreToolUse'). */
  eventName: string
  /** kebab-case directory name (e.g. 'pre-tool-use'). */
  kebabName: string
}

/** A discovered skill with its scripts, hooks, and source directory. */
export interface SkillInfo {
  /** Hooks declared in SKILL.md frontmatter. */
  hooks: SkillHookInfo[]
  /** Skill directory name (e.g. 'commit'). */
  name: string
  /** Absolute paths to TypeScript scripts referenced in markdown. */
  scripts: string[]
  /** Absolute path to the skill's source directory under skills/. */
  srcDir: string
}

/** A discovered agent definition. */
export interface AgentInfo {
  /** Agent name (filename without .md extension). */
  name: string
  /** Absolute paths to TypeScript scripts referenced in the agent markdown. */
  scripts: string[]
  /** Absolute path to the agent's .md file. */
  srcPath: string
}

/** Metadata extracted from the plugin's package.json. */
export interface PackageMetadata {
  description?: string | undefined
  license?: string | undefined
  /** Unscoped package name (e.g. 'plugins-dev-tools', not '@marketplace/plugins-dev-tools'). */
  name: string
  /** Semver version with short git SHA appended (e.g. '1.0.0+abc1234'). */
  version: string
}

/**
 * The complete build plan produced by discoverPlugin().
 *
 * This is the explicit intermediate data structure that decouples
 * discovery from bundling and asset emission.
 */
export interface PluginBuildPlan {
  /** Discovered agent definitions. */
  agents: AgentInfo[]
  /** All esbuild entry points (hooks + skill scripts + skill hooks + agent scripts). */
  entryPoints: EntryPoint[]
  /** Plugin-level hook directory names (e.g. ['pre-tool-use']). */
  hookDirs: string[]
  /** Plugin-level hook entry points (subset of entryPoints, for reference). */
  hookEntries: EntryPoint[]
  /** Absolute path to MCP server entry, or undefined if no MCP server. */
  mcpEntry?: string | undefined
  /** Parsed package.json metadata for manifest generation. */
  pkg: PackageMetadata
  /** Discovered skills with their scripts and hooks. */
  skills: SkillInfo[]
}

// ---------------------------------------------------------------------------
// Build result — what buildPlugin() returns
// ---------------------------------------------------------------------------

/** Result returned by buildPlugin() after a successful build. */
export interface PluginBuildResult {
  /** esbuild metafile for post-build analysis (undefined if no entry points). */
  metafile?: Metafile | undefined
  /** The build plan that was executed. */
  plan: PluginBuildPlan
}
