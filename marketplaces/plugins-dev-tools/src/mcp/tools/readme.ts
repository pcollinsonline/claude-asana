/**
 * MCP tool for the readme update workflow: prepare → write (via built-in Write tool).
 *
 * `readme_prepare` gathers package metadata, detects source changes via git, and
 * returns structured data so the LLM can decide which READMEs need updating.
 * Short-circuits with `status: 'up_to_date'` when no changes are detected.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import { getRepoRoot } from './_shared.js'

export { _resetRepoRoot } from './_shared.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolResult {
  [key: string]: unknown
  content: { text: string; type: 'text' }[]
  isError?: true
}

interface ChangedFileInfo {
  path: string
  status: 'A' | 'D' | 'M'
  workspaceDir: string | null
}

interface PackageJson {
  description: string | null
  name: string
  scripts: Record<string, string>
  workspaceDeps: string[]
}

interface PackageMetadata {
  category: string
  existingReadme: string | null
  exports: string[] | null
  hasChanges: boolean
  packageJson: PackageJson
  packageType: 'app' | 'config' | 'library' | 'tooling'
  workspaceDir: string
}

interface PackageSummary {
  category: string
  description: string | null
  name: string
  workspaceDir: string
}

interface RootMetadata {
  allPackages: PackageSummary[]
  changedRootFiles: string[]
  existingReadme: string | null
  rootPackageJson: {
    engines: Record<string, string> | null
    scripts: Record<string, string>
  }
  workspacePatterns: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Derive workspace prefixes (e.g. "apps", "packages") from pnpm-workspace.yaml patterns. */
export const workspacePrefixesFromPatterns = (patterns: string[]): Set<string> => {
  const prefixes: string[] = []
  for (const p of patterns) {
    const prefix = p.split('/')[0]
    if (prefix) prefixes.push(prefix)
  }
  return new Set(prefixes)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a file and return its content, or null if it doesn't exist. */
const readFileOrNull = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

/** Extract the workspace directory (e.g. "packages/core") from a file path. */
export const getWorkspaceDir = (filePath: string, prefixes: Set<string>): string | null => {
  const segments = filePath.split('/')
  const first = segments[0]
  if (segments.length >= 2 && first && prefixes.has(first)) {
    return `${segments[0]}/${segments[1]}`
  }
  return null
}

/** Extract the category (e.g. "apps", "packages") from a workspace directory. */
const getCategory = (workspaceDir: string): string => workspaceDir.split('/')[0] ?? 'unknown'

/** Parse workspace dependency names from a package.json dependencies/devDependencies. */
const extractWorkspaceDeps = (pkg: Record<string, unknown>): string[] => {
  const deps: string[] = []
  for (const field of ['dependencies', 'devDependencies']) {
    const section = pkg[field]
    if (section && typeof section === 'object') {
      for (const [name, version] of Object.entries(section as Record<string, string>)) {
        if (typeof version === 'string' && version.startsWith('workspace:')) {
          deps.push(name)
        }
      }
    }
  }
  return deps.toSorted()
}

/** Parse export names from a TypeScript index file. */
export const parseExports = (content: string): string[] => {
  const names = new Set<string>()

  // Named exports: export const/function/class/type/interface/enum Name
  const namedPattern = /export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/g
  let match: RegExpExecArray | null
  while ((match = namedPattern.exec(content)) !== null) {
    if (match[1]) names.add(match[1])
  }

  // Re-exports: export { Name1, Name2 }
  const reExportPattern = /export\s+\{([^}]+)\}/g
  while ((match = reExportPattern.exec(content)) !== null) {
    if (match[1]) {
      for (const item of match[1].split(',')) {
        // Handle "Name as Alias" — use the alias (exported name)
        const parts = item.trim().split(/\s+as\s+/)
        const name = (parts[1] ?? parts[0])?.trim()
        if (name) names.add(name)
      }
    }
  }

  // Wildcard re-exports: export * from '...' — note the source module
  const wildcardPattern = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g
  while ((match = wildcardPattern.exec(content)) !== null) {
    if (match[1]) names.add(`* from '${match[1]}'`)
  }

  return [...names].toSorted()
}

/** Classify a package as app, library, config, or tooling. */
export const classifyPackageType = (
  category: string,
  scripts: Record<string, string>,
  name: string,
): 'app' | 'config' | 'library' | 'tooling' => {
  if (category === 'apps' || ('dev' in scripts && 'start' in scripts)) return 'app'
  if (category === 'toolchain' || name.includes('config')) return 'config'
  if (category === 'packages') return 'library'
  return 'tooling'
}

/** Parse workspace patterns from pnpm-workspace.yaml. */
export const parseWorkspacePatterns = (content: string): string[] => {
  const patterns: string[] = []
  let inPackages = false
  for (const line of content.split('\n')) {
    if (line.startsWith('packages:')) {
      inPackages = true
      continue
    }
    if (inPackages) {
      const match = /^\s+-\s+['"]?([^'"]+)['"]?\s*$/.exec(line)
      if (match?.[1]) {
        patterns.push(match[1])
      } else if (/^\S/.test(line) && line.trim().length > 0) {
        break
      }
    }
  }
  return patterns
}

/** Discover all workspace directories by scanning workspace patterns. */
const discoverWorkspaceDirs = (root: string, patterns: string[]): string[] => {
  const dirs: string[] = []
  for (const pattern of patterns) {
    // Pattern is like 'apps/*' — resolve the parent and scan for subdirectories
    const parentDir = pattern.replace('/*', '')
    const absParent = path.join(root, parentDir)
    if (!existsSync(absParent)) continue
    try {
      const entries = readdirSync(absParent, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const wsDir = `${parentDir}/${entry.name}`
          // Only include dirs with a package.json
          if (existsSync(path.join(root, wsDir, 'package.json'))) {
            dirs.push(wsDir)
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }
  return dirs.toSorted()
}

/** Resolve a target package argument to a workspace directory. */
export const resolvePackageTarget = (
  target: string,
  root: string,
  workspaceDirs: string[],
  prefixes: Set<string>,
): string | null => {
  // Normalize: trim whitespace, strip trailing slashes, strip @ when it
  // forms a workspace path (but not when it's a real npm scope like @hsc/x).
  let normalized = target.trim().replace(/\/+$/, '')
  if (normalized.startsWith('@')) {
    const withoutAt = normalized.slice(1)
    const prefix = withoutAt.split('/')[0]
    if (prefix && prefixes.has(prefix)) {
      normalized = withoutAt
    }
  }

  // Exact workspace dir match: "packages/sample-api"
  if (workspaceDirs.includes(normalized)) return normalized

  // Directory name match: "sample-api"
  const byDirName = workspaceDirs.find((d) => d.split('/')[1] === normalized)
  if (byDirName) return byDirName

  // Scoped name match: read package.json name fields
  for (const dir of workspaceDirs) {
    const pkgPath = path.join(root, dir, 'package.json')
    const content = readFileOrNull(pkgPath)
    if (content) {
      try {
        const pkg = JSON.parse(content) as Record<string, unknown>
        if (pkg['name'] === normalized) return dir
      } catch {
        // Skip malformed package.json
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Change detection
// ---------------------------------------------------------------------------

/** Get changed files between baseRef and HEAD via git diff. */
const getChangedFiles = (
  root: string,
  baseRef: string,
  prefixes: Set<string>,
): ChangedFileInfo[] | null => {
  try {
    const output = execFileSync('git', ['diff', '--name-status', `${baseRef}..HEAD`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    if (!output) return []

    const files: ChangedFileInfo[] = []
    for (const line of output.split('\n').filter(Boolean)) {
      const [statusChar, ...pathParts] = line.split('\t')
      const filePath = pathParts.join('\t')
      if (!filePath || !statusChar) continue

      const status = statusChar.charAt(0) as 'A' | 'D' | 'M'
      files.push({ path: filePath, status, workspaceDir: getWorkspaceDir(filePath, prefixes) })
    }
    return files
  } catch {
    return null
  }
}

/** Check whether a README.md exists for a workspace dir. */
const readmeExists = (root: string, workspaceDir: string): boolean =>
  existsSync(path.join(root, workspaceDir, 'README.md'))

// ---------------------------------------------------------------------------
// Metadata gathering
// ---------------------------------------------------------------------------

type MetadataResult = { data: PackageMetadata; ok: true } | { ok: false; warning: string }

/** Gather metadata for a single package. */
const gatherPackageMetadata = (
  root: string,
  workspaceDir: string,
  hasChanges: boolean,
): MetadataResult => {
  const pkgPath = path.join(root, workspaceDir, 'package.json')
  const pkgContent = readFileOrNull(pkgPath)
  if (!pkgContent) return { ok: false, warning: `${workspaceDir}: package.json not found` }

  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(pkgContent) as Record<string, unknown>
  } catch {
    return { ok: false, warning: `${workspaceDir}: malformed package.json` }
  }

  const category = getCategory(workspaceDir)
  const name = (pkg['name'] as string) ?? path.basename(workspaceDir)
  const scripts = (pkg['scripts'] as Record<string, string>) ?? {}

  // Parse exports from src/index.ts if it exists
  const indexContent = readFileOrNull(path.join(root, workspaceDir, 'src', 'index.ts'))
  const exports = indexContent ? parseExports(indexContent) : null

  // Read existing README (only for packages with changes to keep response bounded)
  const existingReadme = hasChanges
    ? readFileOrNull(path.join(root, workspaceDir, 'README.md'))
    : null

  return {
    data: {
      category,
      existingReadme,
      exports,
      hasChanges,
      packageJson: {
        description: (pkg['description'] as string) ?? null,
        name,
        scripts,
        workspaceDeps: extractWorkspaceDeps(pkg),
      },
      packageType: classifyPackageType(category, scripts, name),
      workspaceDir,
    },
    ok: true,
  }
}

/** Gather root-level metadata for the root README. */
const gatherRootMetadata = (
  root: string,
  workspaceDirs: string[],
  changedRootFiles: string[],
): { metadata: RootMetadata; warnings: string[] } => {
  const warnings: string[] = []

  // Workspace patterns
  const wsYaml = readFileOrNull(path.join(root, 'pnpm-workspace.yaml'))
  const workspacePatterns = wsYaml ? parseWorkspacePatterns(wsYaml) : []

  // All packages summary
  const allPackages: PackageSummary[] = []
  for (const dir of workspaceDirs) {
    const pkgContent = readFileOrNull(path.join(root, dir, 'package.json'))
    if (!pkgContent) {
      warnings.push(`${dir}: package.json not found`)
      continue
    }
    try {
      const pkg = JSON.parse(pkgContent) as Record<string, unknown>
      allPackages.push({
        category: getCategory(dir),
        description: (pkg['description'] as string) ?? null,
        name: (pkg['name'] as string) ?? path.basename(dir),
        workspaceDir: dir,
      })
    } catch {
      warnings.push(`${dir}: malformed package.json`)
    }
  }

  // Root package.json
  const rootPkgContent = readFileOrNull(path.join(root, 'package.json'))
  let rootPackageJson: RootMetadata['rootPackageJson'] = { engines: null, scripts: {} }
  if (rootPkgContent) {
    try {
      const pkg = JSON.parse(rootPkgContent) as Record<string, unknown>
      rootPackageJson = {
        engines: (pkg['engines'] as Record<string, string>) ?? null,
        scripts: (pkg['scripts'] as Record<string, string>) ?? {},
      }
    } catch {
      warnings.push('root: malformed package.json')
    }
  } else {
    warnings.push('root: package.json not found')
  }

  // Existing root README
  const existingReadme = readFileOrNull(path.join(root, 'README.md'))

  return {
    metadata: {
      allPackages,
      changedRootFiles,
      existingReadme,
      rootPackageJson,
      workspacePatterns,
    },
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

/**
 * MCP handler for `readme_prepare`. Detects source changes, gathers package
 * metadata, and returns structured data for README generation.
 */
export const handleReadmePrepare = ({
  baseRef,
  target,
}: {
  baseRef?: string | undefined
  target?: string | undefined
}): ToolResult => {
  if (!target) {
    return {
      content: [
        {
          text: JSON.stringify({
            error: "target is required: use 'root', '*', or a package name/path",
            success: false,
          }),
          type: 'text',
        },
      ],
      isError: true,
    }
  }

  try {
    const root = getRepoRoot()
    const resolvedBaseRef = baseRef ?? 'main'

    // Discover all workspace directories
    const wsYaml = readFileOrNull(path.join(root, 'pnpm-workspace.yaml'))
    const patterns = wsYaml ? parseWorkspacePatterns(wsYaml) : []
    const prefixes = workspacePrefixesFromPatterns(patterns)
    const allWorkspaceDirs = discoverWorkspaceDirs(root, patterns)

    // For single-package target, resolve to a workspace dir
    let targetWorkspaceDir: string | null = null
    if (target !== '*' && target !== 'root') {
      targetWorkspaceDir = resolvePackageTarget(target, root, allWorkspaceDirs, prefixes)
      if (!targetWorkspaceDir) {
        return {
          content: [
            {
              text: JSON.stringify({
                availablePackages: allWorkspaceDirs,
                error: `Package not found: ${target}`,
                success: false,
              }),
              type: 'text',
            },
          ],
          isError: true,
        }
      }
    }

    const warnings: string[] = []

    // Change detection — try baseRef, fall back to origin/<baseRef>
    const changedFiles =
      getChangedFiles(root, resolvedBaseRef, prefixes) ??
      getChangedFiles(root, `origin/${resolvedBaseRef}`, prefixes)

    // If change detection fails entirely (no common ancestor), full scan
    if (changedFiles === null) {
      const packages: PackageMetadata[] = []
      const dirsToScan = targetWorkspaceDir ? [targetWorkspaceDir] : allWorkspaceDirs
      for (const dir of dirsToScan) {
        const result = gatherPackageMetadata(root, dir, true)
        if (result.ok) {
          packages.push(result.data)
        } else {
          warnings.push(result.warning)
        }
      }

      const includeRoot = target === '*' || target === 'root'
      let rootMetadata: RootMetadata | null = null
      if (includeRoot) {
        const rootResult = gatherRootMetadata(root, allWorkspaceDirs, [])
        rootMetadata = rootResult.metadata
        warnings.push(...rootResult.warnings)
      }

      return {
        content: [
          {
            text: JSON.stringify({
              changedFiles: [],
              changedWorkspaces: dirsToScan,
              packages,
              repoRoot: root,
              root: rootMetadata,
              status: 'no_history',
              target: target,
              warnings,
            }),
            type: 'text',
          },
        ],
      }
    }

    // Compute changed workspace dirs and root-level changed files
    const changedWorkspaceSet = new Set<string>()
    const changedRootFiles: string[] = []
    for (const file of changedFiles) {
      if (file.workspaceDir) {
        changedWorkspaceSet.add(file.workspaceDir)
      } else {
        changedRootFiles.push(file.path)
      }
    }
    const hasRootChanges = changedRootFiles.length > 0
    const changedWorkspaces = [...changedWorkspaceSet].toSorted()

    // Filter to target if single-package mode
    if (targetWorkspaceDir) {
      const hasChanges = changedWorkspaceSet.has(targetWorkspaceDir)
      if (!hasChanges && readmeExists(root, targetWorkspaceDir)) {
        return {
          content: [
            {
              text: JSON.stringify({
                changedFiles: [],
                changedWorkspaces: [],
                packages: [],
                repoRoot: root,
                root: null,
                status: 'up_to_date',
                target: target,
                warnings: [],
              }),
              type: 'text',
            },
          ],
        }
      }

      const result = gatherPackageMetadata(root, targetWorkspaceDir, true)
      if (result.ok) {
        return {
          content: [
            {
              text: JSON.stringify({
                changedFiles: changedFiles.filter((f) => f.workspaceDir === targetWorkspaceDir),
                changedWorkspaces: hasChanges ? [targetWorkspaceDir] : [],
                packages: [result.data],
                repoRoot: root,
                root: null,
                status: 'stale',
                target: target,
                warnings: [],
              }),
              type: 'text',
            },
          ],
        }
      }
      return {
        content: [
          {
            text: JSON.stringify({
              changedFiles: changedFiles.filter((f) => f.workspaceDir === targetWorkspaceDir),
              changedWorkspaces: hasChanges ? [targetWorkspaceDir] : [],
              packages: [],
              repoRoot: root,
              root: null,
              status: 'stale',
              target: target,
              warnings: [result.warning],
            }),
            type: 'text',
          },
        ],
      }
    }

    // Root-only mode — only root-level files and workspace package.json changes
    // affect the root README (source code changes within packages do not).
    const hasPackageJsonChanges = changedFiles.some(
      (f) => f.workspaceDir && f.path.endsWith('/package.json'),
    )

    if (target === 'root') {
      if (!hasRootChanges && !hasPackageJsonChanges && existsSync(path.join(root, 'README.md'))) {
        return {
          content: [
            {
              text: JSON.stringify({
                changedFiles: [],
                changedWorkspaces: [],
                packages: [],
                repoRoot: root,
                root: null,
                status: 'up_to_date',
                target: 'root',
                warnings: [],
              }),
              type: 'text',
            },
          ],
        }
      }

      const rootResult = gatherRootMetadata(root, allWorkspaceDirs, changedRootFiles)
      return {
        content: [
          {
            text: JSON.stringify({
              changedFiles: changedFiles.filter((f) => !f.workspaceDir),
              changedWorkspaces,
              packages: [],
              repoRoot: root,
              root: rootResult.metadata,
              status: 'stale',
              target: 'root',
              warnings: rootResult.warnings,
            }),
            type: 'text',
          },
        ],
      }
    }

    // All mode (*) — short-circuit if no changes and all READMEs exist
    if (changedWorkspaces.length === 0 && !hasRootChanges) {
      const allReadmesExist =
        allWorkspaceDirs.every((d) => readmeExists(root, d)) &&
        existsSync(path.join(root, 'README.md'))
      if (allReadmesExist) {
        return {
          content: [
            {
              text: JSON.stringify({
                changedFiles: [],
                changedWorkspaces: [],
                packages: [],
                repoRoot: root,
                root: null,
                status: 'up_to_date',
                target: '*',
                warnings: [],
              }),
              type: 'text',
            },
          ],
        }
      }
    }

    // Gather metadata for changed packages (+ packages missing READMEs)
    const packages: PackageMetadata[] = []
    for (const dir of allWorkspaceDirs) {
      const hasChanges = changedWorkspaceSet.has(dir)
      const needsReadme = !readmeExists(root, dir)
      if (hasChanges || needsReadme) {
        const result = gatherPackageMetadata(root, dir, hasChanges || needsReadme)
        if (result.ok) {
          packages.push(result.data)
        } else {
          warnings.push(result.warning)
        }
      }
    }

    // Include root metadata only when root-relevant files changed (root-level
    // files or workspace package.json files) or root README is missing.
    const includeRoot =
      hasRootChanges || hasPackageJsonChanges || !existsSync(path.join(root, 'README.md'))

    if (includeRoot) {
      const rootResult = gatherRootMetadata(root, allWorkspaceDirs, changedRootFiles)
      return {
        content: [
          {
            text: JSON.stringify({
              changedFiles,
              changedWorkspaces,
              packages,
              repoRoot: root,
              root: rootResult.metadata,
              status: 'stale',
              target: '*',
              warnings: [...warnings, ...rootResult.warnings],
            }),
            type: 'text',
          },
        ],
      }
    }

    return {
      content: [
        {
          text: JSON.stringify({
            changedFiles,
            changedWorkspaces,
            packages,
            repoRoot: root,
            root: null,
            status: 'stale',
            target: '*',
            warnings,
          }),
          type: 'text',
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        { text: `Error: ${error instanceof Error ? error.message : String(error)}`, type: 'text' },
      ],
      isError: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register readme tools on the MCP server. */
export const registerReadmeTools = (server: McpServer): void => {
  server.registerTool(
    'readme_prepare',
    {
      annotations: { readOnlyHint: true },
      description:
        'Gather metadata needed to update README.md files. Detects which packages have source changes (via git diff against a base branch), reads package metadata, and returns structured data. Returns status "up_to_date" when no READMEs need changes. Call this first before writing any READMEs.',
      inputSchema: {
        baseRef: z.string().optional().describe('Git ref for change detection (default: "main").'),
        target: z
          .string()
          .describe('Required. `*` for all READMEs, `root` for root only, or a package name/path.'),
      },
    },
    handleReadmePrepare,
  )
}
