/**
 * MCP tools for the two-step commit workflow: prepare → execute.
 *
 * `commit_prepare` gathers repo state (changed files, diff, config) so the LLM
 * can draft a conventional commit message. `commit_execute` stages files, validates
 * the header, commits, and verifies the result in a single atomic call.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { execFileSync, execSync } from 'node:child_process'
import path from 'node:path'
import { z } from 'zod'

import { assembleMessage, commit, normalizeHeader } from '../../skills/commit/commit.js'

import { getCurrentBranch, getRepoRoot } from './_shared.js'

export { _resetRepoRoot } from './_shared.js'

const REPO_CONFIG = {
  allowedTypes: [
    'ai',
    'build',
    'chore',
    'ci',
    'docs',
    'feat',
    'fix',
    'perf',
    'refactor',
    'revert',
    'style',
    'test',
  ],
  headerMaxLength: 100,
  workspacePrefixes: ['apps', 'marketplaces', 'packages', 'toolchain'],
} as const

/** Files excluded from the full unified diff — their per-file diffStat is still returned. */
const DIFF_EXCLUDE_PATTERNS = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock']

/** Per-file metadata returned by commit_prepare for LLM analysis. */
export interface FileStatus {
  /** Lines added/removed summary, e.g. "+12 -3". Null for untracked files. */
  diffStat: string | null
  path: string
  staged: boolean
  /** Human-readable status, e.g. "staged:modified", "untracked". */
  status: string
  /** Monorepo workspace directory, e.g. "packages/core". Null for root-level files. */
  workspaceDir: string | null
}

/** Map a single porcelain status character (e.g. 'M') to a human-readable word. */
const describeStatusChar = (c: string): string => {
  const map: Record<string, string> = {
    A: 'added',
    C: 'copied',
    D: 'deleted',
    M: 'modified',
    R: 'renamed',
    U: 'unmerged',
  }
  return map[c] ?? c
}

/** Convert the two-character XY status from `git status --porcelain` to a readable label. */
const describeStatus = (xy: string): string => {
  const x = xy[0] ?? ' '
  const y = xy[1] ?? ' '
  if (x === '?' && y === '?') return 'untracked'
  const parts: string[] = []
  if (x !== ' ' && x !== '?') parts.push(`staged:${describeStatusChar(x)}`)
  if (y !== ' ' && y !== '?') parts.push(`unstaged:${describeStatusChar(y)}`)
  return parts.join(', ') || 'unknown'
}

/** Extract the workspace directory (e.g. "packages/core") from a file path, or null for root-level files. */
const getWorkspaceDir = (filePath: string): string | null => {
  const segments = filePath.split('/')
  if (
    segments.length >= 2 &&
    REPO_CONFIG.workspacePrefixes.includes(
      segments[0] as (typeof REPO_CONFIG.workspacePrefixes)[number],
    )
  ) {
    return `${segments[0]}/${segments[1]}`
  }
  return null
}

/** Run `git diff HEAD --numstat` and return a map of file path → "+added -removed" summary. */
const getDiffStats = (root: string, scopeArgs: string[]): Map<string, string> => {
  const output = execFileSync('git', ['diff', 'HEAD', '--numstat', ...scopeArgs], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stats = new Map<string, string>()
  for (const line of output.split('\n').filter(Boolean)) {
    const [added, removed, file] = line.split('\t')
    if (file) stats.set(file, `+${added} -${removed}`)
  }
  return stats
}

/** Parse `git status --porcelain=v1` into structured FileStatus entries (diffStat populated later). */
const parseGitStatus = (root: string): FileStatus[] => {
  const output = execSync('git status --porcelain=v1', {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const xy = line.slice(0, 2)
      let filePath = line.slice(3)
      // Porcelain v1 renames: "R old -> new" — take the destination path
      if (filePath.includes(' -> ')) {
        filePath = filePath.split(' -> ')[1] ?? filePath
      }
      return {
        diffStat: null,
        path: filePath,
        staged: !xy.startsWith(' ') && !xy.startsWith('?'),
        status: describeStatus(xy),
        workspaceDir: getWorkspaceDir(filePath),
      }
    })
}

/** Filter files by optional scope — a directory prefix or comma-separated file list. */
export const applyScope = (
  files: FileStatus[],
  scope: string | undefined,
  warnings: string[],
): FileStatus[] => {
  if (!scope) return files

  if (scope.includes(',')) {
    const scopedPaths = scope.split(',').map((s) => s.trim())
    const filePaths = new Set(files.map((f) => f.path))
    for (const p of scopedPaths) {
      if (!filePaths.has(p)) warnings.push(`No changes found for: ${p}`)
    }
    return files.filter((f) => scopedPaths.includes(f.path))
  }

  // Directory prefix
  const dir = scope.endsWith('/') ? scope : `${scope}/`
  return files.filter((f) => f.path.startsWith(dir) || f.path === scope)
}

/** Group files by workspace directory, sorted alphabetically with "(root)" last. */
export const groupByWorkspace = (files: FileStatus[]): Record<string, FileStatus[]> => {
  const grouped: Record<string, FileStatus[]> = {}
  for (const file of files) {
    const key = file.workspaceDir ?? '(root)'
    const group = grouped[key]
    if (group) {
      group.push(file)
    } else {
      grouped[key] = [file]
    }
  }

  // Sort keys alphabetically, "(root)" last
  const sorted: Record<string, FileStatus[]> = {}
  const keys = Object.keys(grouped).toSorted((a, b) => {
    if (a === '(root)') return 1
    if (b === '(root)') return -1
    return a.localeCompare(b)
  })
  for (const key of keys) {
    sorted[key] = grouped[key] ?? []
  }
  return sorted
}

/**
 * Deterministically suggest a commit scope from the changed file set.
 * Returns the workspace dir for single-workspace changes, "monorepo" for cross-cutting
 * changes, or null when the LLM should decide (ambiguous cases).
 */
export const inferScope = (files: FileStatus[]): string | null => {
  const workspaceDirs = new Set<string>()
  let hasRootFiles = false

  for (const file of files) {
    if (file.workspaceDir === null) {
      hasRootFiles = true
    } else {
      workspaceDirs.add(file.workspaceDir)
    }
  }

  // Root files only → null (omit scope)
  if (workspaceDirs.size === 0) return null

  // Mixed root + workspace → LLM decides
  if (hasRootFiles) return null

  // Single workspace, no root files → unambiguous
  if (workspaceDirs.size === 1) return [...workspaceDirs][0] ?? null

  // Multiple workspaces — check top-level dirs
  const topLevels = new Set([...workspaceDirs].map((d) => d.split('/')[0] ?? ''))
  topLevels.delete('')

  // Cross-cutting (multiple top-level dirs) → "monorepo"
  if (topLevels.size > 1) return 'monorepo'

  // Multiple workspaces under same top-level → LLM decides (can't determine cause vs. ripple)
  return null
}

interface ValidationResult {
  errors: string[]
  valid: boolean
}

/** Validate a conventional commit header against repo rules (type, length, casing, punctuation). */
export const validateHeader = (header: string): ValidationResult => {
  const errors: string[] = []

  if (header.length > REPO_CONFIG.headerMaxLength) {
    errors.push(
      `Header exceeds max length of ${REPO_CONFIG.headerMaxLength} (got ${header.length})`,
    )
  }

  const match = /^([^(:\s]+)(?:\(([^)]+)\))?:\s*(.+)$/.exec(header)
  if (!match) {
    errors.push('Header does not match conventional commits format: type(scope): subject')
    return { errors, valid: false }
  }

  const [, type, , subject] = match

  if (!REPO_CONFIG.allowedTypes.includes(type as (typeof REPO_CONFIG.allowedTypes)[number])) {
    errors.push(`Invalid type "${type}". Allowed: ${REPO_CONFIG.allowedTypes.join(', ')}`)
  }

  if (subject !== subject?.toLowerCase()) {
    errors.push(`Subject must be fully lowercase (got "${subject}")`)
  }

  if (subject?.endsWith('.')) {
    errors.push('Subject must not end with a period')
  }

  return { errors, valid: errors.length === 0 }
}

interface ToolResult {
  [key: string]: unknown
  content: { text: string; type: 'text' }[]
  isError?: true
}

/**
 * MCP handler for `commit_prepare`. Gathers changed files with per-file diff stats,
 * recent commits, and repo config. Does NOT include the unified diff — use `commit_diff`
 * to fetch that on demand for files where diffStat alone isn't enough context.
 */
export const handleCommitPrepare = ({ scope }: { scope: string | undefined }): ToolResult => {
  try {
    const root = getRepoRoot()
    const branch = getCurrentBranch()
    const warnings: string[] = []

    let files = parseGitStatus(root)
    files = applyScope(files, scope, warnings)

    const scopeArgs =
      scope && !scope.includes(',') ? ['--', `${scope.endsWith('/') ? scope : `${scope}/`}`] : []

    // Attach per-file diff stats
    const diffStats = getDiffStats(root, scopeArgs)
    for (const file of files) {
      file.diffStat = diffStats.get(file.path) ?? null
    }

    const recentCommits = execSync('git log --oneline -10', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)

    return {
      content: [
        {
          text: JSON.stringify({
            branch,
            config: {
              allowedTypes: [...REPO_CONFIG.allowedTypes],
              headerMaxLength: REPO_CONFIG.headerMaxLength,
              workspaceDirs: REPO_CONFIG.workspacePrefixes.map((p) => `${p}/*`),
            },
            files,
            filesByWorkspace: groupByWorkspace(files),
            inferredScope: inferScope(files),
            recentCommits,
            repoRoot: root,
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

/**
 * MCP handler for `commit_diff`. Returns the unified diff for specific files or all
 * changed files. Lock files (DIFF_EXCLUDE_PATTERNS) are always excluded. Returns raw
 * diff text (not JSON) to minimize token overhead.
 */
export const handleCommitDiff = ({ files }: { files?: string[] | undefined }): ToolResult => {
  try {
    const root = getRepoRoot()
    const fileArgs = files?.length ? ['--', ...files] : []
    const excludeArgs = DIFF_EXCLUDE_PATTERNS.flatMap((p) => ['--', `:!${p}`])
    const diff = execFileSync('git', ['diff', 'HEAD', ...fileArgs, ...excludeArgs], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { content: [{ text: diff || '(no changes)', type: 'text' }] }
  } catch (error) {
    return {
      content: [
        { text: `Error: ${error instanceof Error ? error.message : String(error)}`, type: 'text' },
      ],
      isError: true,
    }
  }
}

/**
 * MCP handler for `commit_execute`. Stages the given files, validates the header,
 * runs `git commit`, and verifies the result. Returns structured success/error responses
 * with a `stage` field indicating where any failure occurred. Staging is idempotent.
 */
export const handleCommitExecute = ({
  body,
  coAuthor,
  files,
  header,
}: {
  body: string | undefined
  coAuthor: string | undefined
  files: string[]
  header: string
}): ToolResult => {
  try {
    const root = getRepoRoot()

    // Validate all paths are within repo root
    const invalidPaths = files.filter((f) => !path.resolve(f).startsWith(root))
    if (invalidPaths.length > 0) {
      return {
        content: [
          {
            text: JSON.stringify({
              errors: invalidPaths.map((p) => `Path outside repo root: ${p}`),
              isError: true,
              stage: 'validation',
              success: false,
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    // Pre-validate header
    const { errors: headerErrors, valid } = validateHeader(header)
    if (!valid) {
      return {
        content: [
          {
            text: JSON.stringify({
              errors: headerErrors,
              isError: true,
              stage: 'validation',
              success: false,
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    // Stage files (execFileSync — no shell, args passed directly)
    try {
      execFileSync('git', ['add', '--', ...files], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (stageError) {
      return {
        content: [
          {
            text: JSON.stringify({
              errors: [stageError instanceof Error ? stageError.message : String(stageError)],
              isError: true,
              stage: 'staging',
              success: false,
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    // Execute commit (captureOutput=true keeps output off the JSON-RPC stdout)
    try {
      commit(header, body, coAuthor, true)
    } catch (commitError) {
      return {
        content: [
          {
            text: JSON.stringify({
              errors: [commitError instanceof Error ? commitError.message : String(commitError)],
              isError: true,
              stage: 'commit',
              success: false,
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    // Verify
    const logLines = execSync('git log -1 --format=%H%n%h', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')

    const commitHash = logLines[0] ?? ''
    const commitHashShort = logLines[1] ?? ''
    const branch = getCurrentBranch()

    const remainingChanges = execSync('git status --porcelain=v1', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter(Boolean).length

    return {
      content: [
        {
          text: JSON.stringify({
            branch,
            commitHash,
            commitHashShort,
            commitMessage: normalizeHeader(assembleMessage(header, body, coAuthor)),
            remainingChanges,
            success: true,
          }),
          type: 'text',
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          text: JSON.stringify({
            errors: [error instanceof Error ? error.message : String(error)],
            isError: true,
            stage: 'commit',
            success: false,
          }),
          type: 'text',
        },
      ],
      isError: true,
    }
  }
}

/** Register both commit_prepare and commit_execute tools on the MCP server. */
export const registerCommitTools = (server: McpServer): void => {
  server.registerTool(
    'commit_prepare',
    {
      annotations: { readOnlyHint: true },
      description:
        'Gather repository state for commit preparation. Returns changed files with status, diff, recent commits, and commit config. Call this first before commit_execute.',
      inputSchema: {
        scope: z
          .string()
          .optional()
          .describe(
            'Optional: a directory path, comma-separated file paths, or omit for all changes',
          ),
      },
    },
    handleCommitPrepare,
  )

  server.registerTool(
    'commit_diff',
    {
      annotations: { readOnlyHint: true },
      description:
        'Return the unified diff for specific files or all changed files. Lock files are always excluded. Use after commit_prepare when diffStat alone is not enough to understand the changes.',
      inputSchema: {
        files: z
          .array(z.string())
          .optional()
          .describe('File paths (relative to repo root) to diff. Omit for all changed files.'),
      },
    },
    handleCommitDiff,
  )

  server.registerTool(
    'commit_execute',
    {
      description:
        'Stage specified files, validate the commit header, execute the commit, and verify the result. Returns commit hash and status on success, or structured errors on failure. Staging is idempotent — safe to retry.',
      inputSchema: {
        body: z
          .string()
          .optional()
          .describe('Optional commit body explaining motivation and context'),
        coAuthor: z
          .string()
          .optional()
          .describe('Optional co-author name, e.g. "Claude Sonnet 4.6"'),
        files: z.array(z.string()).describe('Absolute paths to files to stage and commit'),
        header: z.string().describe('Conventional commit header: type(scope): subject'),
      },
    },
    handleCommitExecute,
  )
}
