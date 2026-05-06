/**
 * MCP tools for the plugins-doc update workflow: prepare → update.
 *
 * `plugins_doc_prepare` checks whether marketplaces/docs/plugins.md is stale relative to
 * the plugin source tree and identifies exactly which files changed.
 *
 * `plugins_doc_update` writes updated content to marketplaces/docs/plugins.md.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
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

type FileType =
  | 'agent'
  | 'build'
  | 'hook'
  | 'marketplace-json'
  | 'mcp-tool'
  | 'other'
  | 'package-json'
  | 'plugins-base'
  | 'skill'

interface ChangedFile {
  entityName: string | null
  fileType: FileType
  path: string
  pluginName: string | null
  status: 'A' | 'D' | 'M'
}

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

/** Classify a changed file path into a semantic type for doc-update targeting. */
export const classifyFile = (
  filePath: string,
): { entityName: string | null; fileType: FileType; pluginName: string | null } => {
  // packages/plugins-base/**
  if (filePath.startsWith('packages/plugins-base/')) {
    return { entityName: null, fileType: 'plugins-base', pluginName: null }
  }

  // monorepo-marketplace/.claude-plugin/marketplace.json
  if (filePath.includes('marketplace.json')) {
    return { entityName: null, fileType: 'marketplace-json', pluginName: null }
  }

  // marketplaces/plugins-<name>/...
  const pluginMatch = /^marketplaces\/(plugins-[^/]+)\/(.+)$/.exec(filePath)
  if (!pluginMatch) {
    return { entityName: null, fileType: 'other', pluginName: null }
  }

  const pluginName = pluginMatch[1] ?? null
  const rest = pluginMatch[2] ?? ''

  // skills/*/SKILL.md
  const skillMatch = /^skills\/([^/]+)\/SKILL\.md$/.exec(rest)
  if (skillMatch) {
    return { entityName: skillMatch[1] ?? null, fileType: 'skill', pluginName }
  }

  // agents/*.md
  const agentMatch = /^agents\/([^/]+)\.md$/.exec(rest)
  if (agentMatch) {
    return { entityName: agentMatch[1] ?? null, fileType: 'agent', pluginName }
  }

  // src/hooks/*/index.ts
  const hookMatch = /^src\/hooks\/([^/]+)\/index\.ts$/.exec(rest)
  if (hookMatch) {
    return { entityName: hookMatch[1] ?? null, fileType: 'hook', pluginName }
  }

  // src/mcp/tools/*.ts (exclude test files)
  const mcpMatch = /^src\/mcp\/tools\/([^/]+)\.ts$/.exec(rest)
  if (mcpMatch && !rest.endsWith('.test.ts')) {
    return { entityName: mcpMatch[1] ?? null, fileType: 'mcp-tool', pluginName }
  }

  // src/build.ts
  if (rest === 'src/build.ts') {
    return { entityName: null, fileType: 'build', pluginName }
  }

  // package.json (root of plugin)
  if (rest === 'package.json') {
    return { entityName: null, fileType: 'package-json', pluginName }
  }

  return { entityName: null, fileType: 'other', pluginName }
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const DOC_PATH = 'marketplaces/docs/plugins.md'
const SOURCE_DIRS = ['marketplaces/', 'packages/plugins-base/']

/**
 * MCP handler for `plugins_doc_prepare`. Checks whether marketplaces/docs/plugins.md is stale
 * relative to the plugin source tree. If stale, identifies changed files via git.
 */
export const handlePluginsDocPrepare = (): ToolResult => {
  try {
    const root = getRepoRoot()

    // Get doc's last commit hash and date
    const docLog = execFileSync('git', ['log', '-1', '--format=%H:%aI', '--', DOC_PATH], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    const docLastCommit = docLog ? (docLog.split(':')[0] ?? null) : null
    const docLastDate = docLog ? docLog.slice(docLog.indexOf(':') + 1) : null

    // Get most recent source change date
    const sourceLog = execFileSync('git', ['log', '-1', '--format=%aI', '--', ...SOURCE_DIRS], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    const sourceLastDate = sourceLog || null

    // No doc history — fall back to full scan
    if (!docLastCommit) {
      return {
        content: [
          {
            text: JSON.stringify({
              changedFiles: [],
              docLastCommit: null,
              docLastDate: null,
              repoRoot: root,
              sourceLastDate,
              status: 'no_history',
            }),
            type: 'text',
          },
        ],
      }
    }

    // Freshness check: if doc was modified on or after the most recent source change
    if (sourceLastDate && docLastDate && docLastDate >= sourceLastDate) {
      return {
        content: [
          {
            text: JSON.stringify({
              changedFiles: [],
              docLastCommit,
              docLastDate,
              repoRoot: root,
              sourceLastDate,
              status: 'up_to_date',
            }),
            type: 'text',
          },
        ],
      }
    }

    // Get changed files since doc's last commit
    const diffOutput = execFileSync(
      'git',
      ['diff', '--name-status', `${docLastCommit}..HEAD`, '--', ...SOURCE_DIRS],
      { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()

    const changedFiles: ChangedFile[] = []
    for (const line of diffOutput.split('\n').filter(Boolean)) {
      const [statusChar, ...pathParts] = line.split('\t')
      const filePath = pathParts.join('\t') // Handle paths with tabs (unlikely but safe)
      if (!filePath || !statusChar) continue

      // Filter out build output directories (monorepo-marketplace/plugins-*/)
      if (
        filePath.startsWith('marketplaces/monorepo-marketplace/') &&
        !filePath.includes('.claude-plugin/')
      ) {
        continue
      }

      const status = statusChar.charAt(0) as 'A' | 'D' | 'M'
      const { entityName, fileType, pluginName } = classifyFile(filePath)

      changedFiles.push({ entityName, fileType, path: filePath, pluginName, status })
    }

    return {
      content: [
        {
          text: JSON.stringify({
            changedFiles,
            docLastCommit,
            docLastDate,
            repoRoot: root,
            sourceLastDate,
            status: 'stale',
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
 * MCP handler for `plugins_doc_update`. Writes updated content to marketplaces/docs/plugins.md.
 */
export const handlePluginsDocUpdate = ({ content }: { content: string }): ToolResult => {
  try {
    if (!content.trim()) {
      return {
        content: [
          {
            text: JSON.stringify({ error: 'Content must not be empty', success: false }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    const root = getRepoRoot()
    const docPath = path.join(root, DOC_PATH)

    writeFileSync(docPath, content)

    return {
      content: [
        {
          text: JSON.stringify({ filePath: docPath, success: true }),
          type: 'text',
        },
      ],
    }
  } catch (error) {
    return {
      content: [
        {
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            success: false,
          }),
          type: 'text',
        },
      ],
      isError: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register plugins-doc tools on the MCP server. */
export const registerPluginsDocTools = (server: McpServer): void => {
  server.registerTool(
    'plugins_doc_prepare',
    {
      annotations: { readOnlyHint: true },
      description:
        'Check whether marketplaces/docs/plugins.md is stale relative to the plugin source tree. If stale, identifies exactly which source files changed (via git) and classifies them by type. Call this first.',
    },
    handlePluginsDocPrepare,
  )

  server.registerTool(
    'plugins_doc_update',
    {
      description:
        'Write updated content to marketplaces/docs/plugins.md. Provide the complete file content.',
      inputSchema: {
        content: z.string().describe('The full updated content for marketplaces/docs/plugins.md.'),
      },
    },
    handlePluginsDocUpdate,
  )
}
