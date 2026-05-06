/**
 * MCP tools for plan file management: plan_read + plan_write.
 *
 * Plan files live at `.ai/plugins-dev-tools/plans/gh-{N}.md` and use YAML frontmatter
 * to track issue metadata and workflow status. The body contains a
 * structured plan with task checklists.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import { parseFrontmatter } from '@packages/plugins-base'

import { getRepoRoot } from './_shared.js'

interface ToolResult {
  [key: string]: unknown
  content: { text: string; type: 'text' }[]
  isError?: true
}

/** Resolve the plan file path for a given issue number. */
export const getPlanPath = (root: string, issue: number): string =>
  path.join(root, '.ai', 'plugins-dev-tools', 'plans', `gh-${issue}.md`)

/** Count completed and total task checkboxes in markdown content. */
export const countTasks = (content: string): { completedTasks: number; totalTasks: number } => {
  const checkboxes = content.match(/^[\t ]*- \[([ x])\]/gm) ?? []
  const total = checkboxes.length
  const completed = checkboxes.filter((cb) => cb.includes('[x]')).length
  return { completedTasks: completed, totalTasks: total }
}

const REQUIRED_FRONTMATTER_FIELDS = ['issue', 'status'] as const

const VALID_STATUSES = ['planning', 'implementing', 'shipping', 'complete'] as const

/**
 * MCP handler for `plan_read`. Reads a plan file for the given issue number,
 * parses frontmatter, counts task progress, and returns structured data.
 */
export const handlePlanRead = ({ issue }: { issue: number }): ToolResult => {
  try {
    const root = getRepoRoot()
    const planPath = getPlanPath(root, issue)

    if (!existsSync(planPath)) {
      return {
        content: [
          {
            text: JSON.stringify({
              branch: null,
              completedTasks: 0,
              content: null,
              exists: false,
              status: null,
              totalTasks: 0,
            }),
            type: 'text',
          },
        ],
      }
    }

    const raw = readFileSync(planPath, 'utf8')
    const { body, frontmatter } = parseFrontmatter(raw)
    const { completedTasks, totalTasks } = countTasks(body)

    return {
      content: [
        {
          text: JSON.stringify({
            branch: (frontmatter['branch'] as string | undefined) ?? null,
            completedTasks,
            content: raw,
            exists: true,
            status: (frontmatter['status'] as string | undefined) ?? null,
            totalTasks,
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

/**
 * MCP handler for `plan_write`. Writes a plan file for the given issue number.
 * Creates the directory if needed. Validates that required frontmatter fields
 * (issue, status) are present and status is a valid value.
 */
export const handlePlanWrite = ({
  content,
  issue,
}: {
  content: string
  issue: number
}): ToolResult => {
  try {
    const { frontmatter } = parseFrontmatter(content)

    // Validate required fields
    const missingFields = REQUIRED_FRONTMATTER_FIELDS.filter(
      (field) => frontmatter[field] === undefined || frontmatter[field] === null,
    )
    if (missingFields.length > 0) {
      return {
        content: [
          {
            text: JSON.stringify({
              error: `Missing required frontmatter fields: ${missingFields.join(', ')}`,
              success: false,
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    // Validate status value
    const status = frontmatter['status'] as string
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return {
        content: [
          {
            text: JSON.stringify({
              error: `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`,
              success: false,
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    const root = getRepoRoot()
    const planPath = getPlanPath(root, issue)
    const planDir = path.dirname(planPath)

    mkdirSync(planDir, { recursive: true })
    writeFileSync(planPath, content, 'utf8')

    return {
      content: [
        {
          text: JSON.stringify({ path: planPath, success: true }),
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

/** Register plan_read and plan_write tools on the MCP server. */
export const registerPlanTools = (server: McpServer): void => {
  server.registerTool(
    'plan_read',
    {
      annotations: { readOnlyHint: true },
      description:
        'Read the plan file for a GitHub issue. Returns existence status, workflow status, task progress (completed/total), branch name, and full content. Plan files live at .ai/plugins-dev-tools/plans/gh-{N}.md.',
      inputSchema: {
        issue: z.number().describe('GitHub issue number'),
      },
    },
    handlePlanRead,
  )

  server.registerTool(
    'plan_write',
    {
      description:
        'Write or update the plan file for a GitHub issue. Creates the directory if needed. Validates that content includes YAML frontmatter with required fields (issue, status). Plan files live at .ai/plugins-dev-tools/plans/gh-{N}.md.',
      inputSchema: {
        content: z
          .string()
          .describe(
            'Full plan file content including YAML frontmatter (issue, status required) and markdown body',
          ),
        issue: z.number().describe('GitHub issue number'),
      },
    },
    handlePlanWrite,
  )
}
