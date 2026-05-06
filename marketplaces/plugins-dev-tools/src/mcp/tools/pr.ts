/**
 * MCP tools for the PR workflow: prepare → create.
 *
 * `pr_prepare` gathers branch state (commits, diff stat, existing PR detection)
 * so the LLM can draft PR content. `pr_create` renders a template, composes the
 * body, and creates or updates the PR via `gh`.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { execFileSync } from 'node:child_process'
import { z } from 'zod'

import { extractIssueNumber, getCurrentBranch, getRepoRoot } from './_shared.js'

interface ToolResult {
  [key: string]: unknown
  content: { text: string; type: 'text' }[]
  isError?: true
}

/** Render a template string by substituting `{{var}}` placeholders. */
export const renderTemplate = (template: string, vars: Record<string, string | null>): string => {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value ?? '')
  }
  return result
}

/** Check if a PR already exists for the current branch. Returns the URL or null. */
const checkExistingPr = (): string | null => {
  try {
    const result = execFileSync('gh', ['pr', 'view', '--json', 'url', '-q', '.url'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim() || null
  } catch {
    return null
  }
}

/**
 * MCP handler for `pr_prepare`. Gathers branch state, commits, diff stat,
 * detects existing PRs, extracts issue numbers, and validates preconditions.
 */
export const handlePrPrepare = ({
  targetBranch,
}: {
  targetBranch: string | undefined
}): ToolResult => {
  try {
    const branch = getCurrentBranch()
    const target = targetBranch ?? 'main'

    // Validation
    if (branch === 'main' || branch === 'master') {
      return {
        content: [
          {
            text: JSON.stringify({
              branch,
              targetBranch: target,
              validation: { error: 'Cannot create PR from the main branch.', valid: false },
            }),
            type: 'text',
          },
        ],
      }
    }

    const root = getRepoRoot()

    const commitsRaw = execFileSync('git', ['log', `${target}..HEAD`, '--oneline'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const commits = commitsRaw.trim().split('\n').filter(Boolean)

    if (commits.length === 0) {
      return {
        content: [
          {
            text: JSON.stringify({
              branch,
              commits: [],
              targetBranch: target,
              validation: { error: 'No commits ahead of target branch.', valid: false },
            }),
            type: 'text',
          },
        ],
      }
    }

    const diffStat = execFileSync('git', ['diff', `${target}...HEAD`, '--stat'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    const filesChanged = diffStat.split('\n').filter((line) => line.includes('|')).length

    const existingPrUrl = checkExistingPr()
    const issueNumber = extractIssueNumber(branch)

    return {
      content: [
        {
          text: JSON.stringify({
            branch,
            commits,
            diffStat,
            existingPrUrl,
            filesChanged,
            issueNumber,
            targetBranch: target,
            validation: { valid: true },
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
 * MCP handler for `pr_create`. Renders the template, composes the PR body,
 * and creates or updates the PR via `gh`.
 */
export const handlePrCreate = ({
  base,
  summary,
  template,
  testPlan,
  title,
}: {
  base: string
  summary: string
  template: string
  testPlan: string
  title: string
}): ToolResult => {
  try {
    const branch = getCurrentBranch()
    const issueNumber = extractIssueNumber(branch)

    let body = renderTemplate(template, { summary, testPlan })

    if (issueNumber !== null) {
      body = body.trimEnd() + `\n\nCloses #${issueNumber}\n`
    }

    const existingUrl = checkExistingPr()

    if (existingUrl) {
      execFileSync('gh', ['pr', 'edit', '--title', title, '--body-file', '-'], {
        encoding: 'utf8',
        input: body,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return {
        content: [
          {
            text: JSON.stringify({ action: 'updated', success: true, url: existingUrl }),
            type: 'text',
          },
        ],
      }
    }

    const result = execFileSync(
      'gh',
      ['pr', 'create', '--base', base, '--title', title, '--body-file', '-'],
      {
        encoding: 'utf8',
        input: body,
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    return {
      content: [
        {
          text: JSON.stringify({ action: 'created', success: true, url: result.trim() }),
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
            stage: 'pr',
            success: false,
          }),
          type: 'text',
        },
      ],
      isError: true,
    }
  }
}

/** Register pr_prepare and pr_create tools on the MCP server. */
export const registerPrTools = (server: McpServer): void => {
  server.registerTool(
    'pr_prepare',
    {
      annotations: { readOnlyHint: true },
      description:
        'Gather branch state for PR preparation. Returns current branch, commits, diff stat, existing PR detection, issue number, and validation. Call this first before pr_create.',
      inputSchema: {
        targetBranch: z.string().optional().describe('Base branch for the PR (default: "main")'),
      },
    },
    handlePrPrepare,
  )

  server.registerTool(
    'pr_create',
    {
      description:
        'Render a PR template and create or update a GitHub pull request. Automatically detects existing PRs for the current branch and updates them instead of creating duplicates.',
      inputSchema: {
        base: z.string().describe('Target branch (e.g., "main")'),
        summary: z.string().describe('Bullet points summarizing the changes'),
        template: z.string().describe('Raw template content with {{var}} placeholders to populate'),
        testPlan: z.string().describe('Checklist items for testing'),
        title: z.string().describe('PR title (under 70 characters)'),
      },
    },
    handlePrCreate,
  )
}

export { extractIssueNumber } from './_shared.js'
