// ---------------------------------------------------------------------------
// Plugin discovery — filesystem scanning and validation
//
// Scans a plugin's source tree to produce a PluginBuildPlan:
//   1. Plugin hooks  — src/hooks/<name>/index.ts
//   2. Skill scripts — regex scan of .md files for src/skills/<name>/*.ts refs
//   3. Skill hooks   — SKILL.md frontmatter `hooks:` declarations
//   4. Agents        — agents/*.md with optional script refs
//   5. MCP entry     — src/mcp/server.ts (when config.mcp is provided)
//   6. Package.json  — name, version, description, license
//
// This module is synchronous — all fs operations use *Sync variants.
// It performs no writes and no bundling.
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type {
  AgentInfo,
  EntryPoint,
  PluginBuildConfig,
  PluginBuildPlan,
  SkillHookInfo,
  SkillInfo,
} from './types.js'

import { parseFrontmatter } from '../parse-frontmatter.js'

// ---------------------------------------------------------------------------
// Shared utilities (exported for use by emit-assets)
// ---------------------------------------------------------------------------

/** Convert a kebab-case string to PascalCase. */
export const toPascalCase = (name: string): string =>
  name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')

/** Convert a PascalCase string to kebab-case. */
export const toKebabCase = (name: string): string =>
  name.replaceAll(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()

/** Recursively collect all .md files under a directory. */
export const collectMarkdownFiles = (dir: string): string[] => {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath))
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Stable content hash of every git-tracked file under the plugin's root.
 * Identical input tree → identical hash on any machine, any time.
 *
 * Deferring to `git ls-files` makes gitignore the source of truth for
 * "what counts as source" — generated artifacts (dist/, .turbo/, coverage/,
 * tsbuildinfo, etc.) cannot perturb the hash.
 */
const hashPluginSource = (rootDir: string): string => {
  let files: string[]
  try {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: rootDir, encoding: 'utf8' })
    files = out.split('\0').filter(Boolean)
  } catch {
    return 'unknown'
  }

  const hash = createHash('sha256')
  for (const rel of files.toSorted()) {
    hash.update(rel)
    hash.update('\0')
    hash.update(readFileSync(path.join(rootDir, rel)))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 8)
}

// ---------------------------------------------------------------------------
// Discovery sub-phases
// ---------------------------------------------------------------------------

/** Discover plugin-level hooks by scanning src/hooks/<name>/index.ts. */
const discoverHooks = (
  rootDir: string,
  errors: string[],
): { hookDirs: string[]; hookEntries: EntryPoint[] } => {
  const hooksSrcDir = path.join(rootDir, 'src', 'hooks')
  const hookDirs: string[] = existsSync(hooksSrcDir)
    ? readdirSync(hooksSrcDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    : []

  const hookEntries = hookDirs.map((name) => {
    const entry = path.join(rootDir, 'src', 'hooks', name, 'index.ts')
    if (!existsSync(entry)) {
      errors.push(`Plugin hook "${name}": expected entry point at src/hooks/${name}/index.ts`)
    }
    return { in: entry, out: path.join('hooks', name) }
  })

  return { hookDirs, hookEntries }
}

/** Discover TypeScript scripts referenced in a skill's markdown files. */
const discoverSkillScripts = (
  rootDir: string,
  skillName: string,
  skillDir: string,
  errors: string[],
): string[] => {
  const pattern = new RegExp(String.raw`\bsrc/skills/${skillName}/([a-zA-Z0-9_/-]+\.ts)\b`, 'g')
  const mdFiles = collectMarkdownFiles(skillDir)
  const refs = new Map<string, string>()

  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, 'utf8')
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      const relPath = `src/skills/${skillName}/${match[1]}`
      if (!refs.has(relPath)) {
        refs.set(relPath, path.relative(rootDir, mdFile))
      }
    }
  }

  for (const [relPath, foundIn] of refs) {
    const absPath = path.join(rootDir, relPath)
    if (!existsSync(absPath)) {
      errors.push(
        `Skill "${skillName}": script "${relPath}" referenced in ${foundIn} does not exist`,
      )
    }
  }

  return [...refs.keys()].map((rel) => path.join(rootDir, rel))
}

/** Discover hooks declared in a skill's SKILL.md frontmatter. */
const discoverSkillHooks = (
  rootDir: string,
  skillName: string,
  skillDir: string,
  errors: string[],
): SkillHookInfo[] => {
  const skillMd = path.join(skillDir, 'SKILL.md')
  if (!existsSync(skillMd)) return []

  const content = readFileSync(skillMd, 'utf8')
  const { frontmatter } = parseFrontmatter(content)
  const hooksValue = frontmatter['hooks']
  if (!hooksValue) return []

  // gray-matter parses YAML arrays natively; handle string fallback for safety
  let eventNames: string[]
  if (Array.isArray(hooksValue)) {
    eventNames = hooksValue.map(String)
  } else if (typeof hooksValue === 'string') {
    eventNames = hooksValue
      .replaceAll(/^\[|\]$/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  } else {
    return []
  }

  return eventNames.map((eventName) => {
    const kebabName = toKebabCase(eventName)
    const entry = path.join(rootDir, 'src', 'skills', skillName, 'hooks', kebabName, 'index.ts')
    if (!existsSync(entry)) {
      errors.push(
        `Skill "${skillName}": hook "${eventName}" declared in frontmatter but ` +
          `src/skills/${skillName}/hooks/${kebabName}/index.ts does not exist`,
      )
    }
    return { entry, eventName, kebabName }
  })
}

/** Discover all skills under the skills/ directory. */
const discoverSkills = (rootDir: string, errors: string[]): SkillInfo[] => {
  const skillsSrc = path.join(rootDir, 'skills')
  if (!existsSync(skillsSrc)) return []

  return readdirSync(skillsSrc, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const skillDir = path.join(skillsSrc, d.name)
      return {
        hooks: discoverSkillHooks(rootDir, d.name, skillDir, errors),
        name: d.name,
        scripts: discoverSkillScripts(rootDir, d.name, skillDir, errors),
        srcDir: skillDir,
      }
    })
}

/** Discover TypeScript scripts referenced in an agent markdown file. */
const discoverAgentScripts = (
  rootDir: string,
  agentName: string,
  agentFile: string,
  errors: string[],
): string[] => {
  const pattern = new RegExp(String.raw`\bsrc/agents/${agentName}/([a-zA-Z0-9_/-]+\.ts)\b`, 'g')
  const content = readFileSync(agentFile, 'utf8')
  const refs = new Map<string, string>()

  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const relPath = `src/agents/${agentName}/${match[1]}`
    if (!refs.has(relPath)) {
      refs.set(relPath, path.relative(rootDir, agentFile))
    }
  }

  for (const [relPath, foundIn] of refs) {
    const absPath = path.join(rootDir, relPath)
    if (!existsSync(absPath)) {
      errors.push(
        `Agent "${agentName}": script "${relPath}" referenced in ${foundIn} does not exist`,
      )
    }
  }

  return [...refs.keys()].map((rel) => path.join(rootDir, rel))
}

/** Discover agent definitions under agents/*.md. */
const discoverAgents = (rootDir: string, errors: string[]): AgentInfo[] => {
  const agentsSrc = path.join(rootDir, 'agents')
  if (!existsSync(agentsSrc)) return []

  return readdirSync(agentsSrc, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.md'))
    .map((f) => {
      const name = f.name.replace(/\.md$/, '')
      const srcPath = path.join(agentsSrc, f.name)
      return {
        name,
        scripts: discoverAgentScripts(rootDir, name, srcPath, errors),
        srcPath,
      }
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a plugin's source tree and return a complete build plan.
 *
 * The plan captures every entry point, skill, agent, and MCP entry
 * that the subsequent build and emit phases need. Discovery is
 * synchronous and performs no writes.
 *
 * @throws Error if any discovery validation fails (missing files, etc.)
 */
export const discoverPlugin = (config: PluginBuildConfig): PluginBuildPlan => {
  const { rootDir } = config
  const errors: string[] = []

  // -- Phase 1: Discover all components --

  const { hookDirs, hookEntries } = discoverHooks(rootDir, errors)
  const skills = discoverSkills(rootDir, errors)
  const agents = discoverAgents(rootDir, errors)

  // MCP entry point (validated only when config.mcp is provided)
  const { mcp } = config
  let mcpEntry: string | undefined
  if (mcp) {
    const mcpRelative = mcp.entry ?? 'src/mcp/server.ts'
    mcpEntry = path.join(rootDir, mcpRelative)
    if (!existsSync(mcpEntry)) {
      errors.push(`MCP server: entry point "${mcpRelative}" does not exist`)
    }
  }

  // Bail if any discovery errors
  if (errors.length > 0) {
    console.error('\n\u2717 Build failed with discovery errors:\n')
    for (const err of errors) {
      console.error(`  \u2022 ${err}`)
    }
    console.error('')
    throw new Error('Build aborted due to discovery errors')
  }

  // -- Phase 2: Assemble entry points --

  const skillScriptEntries = skills.flatMap((s) =>
    s.scripts.map((absPath) => {
      const relToSrc = path.relative(path.join(rootDir, 'src', 'skills', s.name), absPath)
      const outName = relToSrc.replace(/\.ts$/, '')
      return { in: absPath, out: path.join('skills', s.name, outName) }
    }),
  )

  const skillHookEntries = skills.flatMap((s) =>
    s.hooks.map((h) => ({
      in: h.entry,
      out: path.join('skills', s.name, 'hooks', h.kebabName),
    })),
  )

  const agentScriptEntries = agents.flatMap((a) =>
    a.scripts.map((absPath) => {
      const relToSrc = path.relative(path.join(rootDir, 'src', 'agents', a.name), absPath)
      const outName = relToSrc.replace(/\.ts$/, '')
      return { in: absPath, out: path.join('agents', a.name, outName) }
    }),
  )

  const entryPoints: EntryPoint[] = [
    ...hookEntries,
    ...skillScriptEntries,
    ...skillHookEntries,
    ...agentScriptEntries,
  ]

  // -- Phase 3: Read package metadata --

  interface PackageJson {
    description?: string
    license?: string
    name?: string
    version?: string
  }

  const pkgRaw = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as PackageJson

  const pkg = {
    description: pkgRaw.description,
    license: pkgRaw.license,
    name: (pkgRaw.name ?? '').replace(/^@[^/]+\//, ''),
    version: `${pkgRaw.version}+${hashPluginSource(rootDir)}`,
  }

  return {
    agents,
    entryPoints,
    hookDirs,
    hookEntries,
    mcpEntry,
    pkg,
    skills,
  }
}
