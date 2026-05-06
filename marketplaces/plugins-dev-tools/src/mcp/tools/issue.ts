/**
 * MCP tools for GitHub issue operations: issue_fetch, issue_create_prepare, issue_create_execute.
 *
 * issue_fetch: Accepts a URL, `#42`, or plain `42`, normalizes to an issue number,
 * and returns structured JSON from `gh issue view`.
 *
 * issue_create_prepare: Gathers auth status, repo name, available labels, and projects.
 *
 * issue_create_execute: Assembles the issue body and creates the issue via `gh`, optionally
 * adding it to a project.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { execFileSync } from 'node:child_process'
import { z } from 'zod'

import { checkGhAuth } from './_shared.js'

interface ToolResult {
  [key: string]: unknown
  content: { text: string; type: 'text' }[]
  isError?: true
}

/**
 * Normalize an issue reference (URL, `#42`, or `42`) to a plain issue number.
 * Returns null if the input doesn't match any recognized format.
 */
export const parseIssueRef = (input: string): number | null => {
  const trimmed = input.trim()

  // GitHub URL: https://github.com/owner/repo/issues/42
  const urlMatch = /\/issues\/(\d+)/.exec(trimmed)
  if (urlMatch) return Number(urlMatch[1])

  // Shorthand: #42
  const hashMatch = /^#(\d+)$/.exec(trimmed)
  if (hashMatch) return Number(hashMatch[1])

  // Plain number: 42
  const numMatch = /^(\d+)$/.exec(trimmed)
  if (numMatch) return Number(numMatch[1])

  return null
}

/**
 * MCP handler for `issue_fetch`. Fetches a GitHub issue by URL, `#N`, or `N`
 * and returns structured JSON with title, body, labels, assignees, comments,
 * state, and url.
 */
export const handleIssueFetch = ({ issue }: { issue: string }): ToolResult => {
  const issueNumber = parseIssueRef(issue)

  if (issueNumber === null) {
    return {
      content: [
        {
          text: JSON.stringify({
            error: `Could not parse issue reference: "${issue}". Expected a URL, #N, or N.`,
            success: false,
          }),
          type: 'text',
        },
      ],
      isError: true,
    }
  }

  const auth = checkGhAuth()
  if (!auth.authenticated) {
    return {
      content: [
        {
          text: JSON.stringify({
            error: 'GitHub CLI not authenticated. Run `gh auth login` first.',
            success: false,
          }),
          type: 'text',
        },
      ],
      isError: true,
    }
  }

  try {
    const output = execFileSync(
      'gh',
      [
        'issue',
        'view',
        String(issueNumber),
        '--json',
        'title,body,labels,assignees,comments,state,url',
      ],
      {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    const data = JSON.parse(output) as Record<string, unknown>

    return {
      content: [
        {
          text: JSON.stringify({ issueNumber, success: true, ...data }),
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
            issueNumber,
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
 * MCP handler for `issue_create_prepare`. Gathers GitHub auth status, current repo name,
 * available labels, and available projects so the LLM can draft issue content.
 */
export const handleIssueCreatePrepare = (): ToolResult => {
  try {
    const auth = checkGhAuth()

    if (!auth.authenticated) {
      return {
        content: [
          {
            text: JSON.stringify({
              error: 'GitHub CLI not authenticated. Run `gh auth login` first.',
              success: false,
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    // Fetch repo name
    let repo = ''
    try {
      repo = execFileSync('gh', ['api', 'repos/{owner}/{repo}', '--jq', '.full_name'], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
    } catch {
      // repo stays empty — caller will handle missing repo
    }

    if (!repo) {
      return {
        content: [
          {
            text: JSON.stringify({
              error:
                'Could not determine repository. Ensure you are in a git repo with a GitHub remote.',
              success: false,
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    // Fetch labels
    let labels: string[] = []
    try {
      const labelsRaw = execFileSync(
        'gh',
        ['label', 'list', '--json', 'name', '--jq', '.[].name'],
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
      ).trim()
      labels = labelsRaw ? labelsRaw.split('\n').filter(Boolean) : []
    } catch {
      labels = []
    }

    // Fetch projects
    let projects: { number: number; title: string }[] = []
    try {
      const projectsRaw = execFileSync('gh', ['project', 'list', '--json', 'number,title'], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()
      projects = projectsRaw ? (JSON.parse(projectsRaw) as { number: number; title: string }[]) : []
    } catch {
      projects = []
    }

    return {
      content: [
        {
          text: JSON.stringify({
            authenticated: true,
            labels,
            projects,
            repo,
            success: true,
            username: auth.username,
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

/** Assemble the four-section issue body with bot attribution. */
export const formatIssueBody = (
  purpose: string,
  context: string,
  requirements: string,
  verification: string,
): string =>
  `## Purpose\n${purpose}\n\n## Context\n${context}\n\n## Requirements\n${requirements}\n\n## Verification\n${verification}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`

/**
 * MCP handler for `issue_create_execute`. Assembles the issue body, creates the issue via
 * `gh issue create`, and optionally adds it to a project.
 */
export const handleIssueCreateExecute = ({
  assignee,
  context,
  labels,
  projectNumber,
  projectOwner,
  purpose,
  repo,
  requirements,
  title,
  verification,
}: {
  assignee?: string | undefined
  context: string
  labels?: string | undefined
  projectNumber?: number | undefined
  projectOwner?: string | undefined
  purpose: string
  repo: string
  requirements: string
  title: string
  verification: string
}): ToolResult => {
  try {
    const body = formatIssueBody(purpose, context, requirements, verification)

    const createArgs = ['issue', 'create', '--repo', repo, '--title', title, '--body-file', '-']
    if (labels) {
      createArgs.push('--label', labels)
    }
    if (assignee) {
      createArgs.push('--assignee', assignee)
    }

    const result = execFileSync('gh', createArgs, {
      encoding: 'utf8',
      input: body,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const url = result.trim()

    if (projectOwner && projectNumber !== undefined) {
      try {
        execFileSync(
          'gh',
          ['project', 'item-add', String(projectNumber), '--owner', projectOwner, '--url', url],
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
        )
      } catch (projectError) {
        // Issue was created; project add is best-effort
        return {
          content: [
            {
              text: JSON.stringify({
                projectError:
                  projectError instanceof Error ? projectError.message : String(projectError),
                success: true,
                url,
                warning: `Issue created but failed to add to project ${projectNumber}.`,
              }),
              type: 'text',
            },
          ],
        }
      }
    }

    return {
      content: [
        {
          text: JSON.stringify({
            addedToProject: projectOwner !== undefined && projectNumber !== undefined,
            success: true,
            url,
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

/** Register the issue_fetch tool on the MCP server. */
export const registerIssueTools = (server: McpServer): void => {
  server.registerTool(
    'issue_fetch',
    {
      annotations: { readOnlyHint: true },
      description:
        'Fetch a GitHub issue by URL, #N, or plain number. Returns structured JSON with title, body, labels, assignees, comments, state, and URL.',
      inputSchema: {
        issue: z
          .string()
          .describe('Issue reference: a GitHub URL, #N, or plain number (e.g. "42")'),
      },
    },
    handleIssueFetch,
  )

  server.registerTool(
    'issue_create_prepare',
    {
      annotations: { readOnlyHint: true },
      description:
        'Gather GitHub auth status, repo name, available labels, and projects before creating an issue. Call this first to get the context needed to draft issue content.',
      inputSchema: {},
    },
    handleIssueCreatePrepare,
  )

  server.registerTool(
    'issue_create_execute',
    {
      description:
        'Create a GitHub issue with a structured four-section body (Purpose, Context, Requirements, Verification). Optionally adds the issue to a project.',
      inputSchema: {
        assignee: z
          .string()
          .optional()
          .describe('GitHub username or @me to assign the issue (optional)'),
        context: z.string().describe('Background, links, references, and motivation for the issue'),
        labels: z.string().optional().describe('Comma-separated label names to apply (optional)'),
        projectNumber: z
          .number()
          .optional()
          .describe('Project number to add the issue to (requires projectOwner)'),
        projectOwner: z
          .string()
          .optional()
          .describe('Owner of the project (org or user login, requires projectNumber)'),
        purpose: z.string().describe('1-2 sentences explaining what this issue is about'),
        repo: z.string().describe('Repository in owner/repo format (from issue_create_prepare)'),
        requirements: z.string().describe('Bullet list of acceptance criteria'),
        title: z.string().describe('Issue title (under 80 characters)'),
        verification: z.string().describe('Checklist of how to verify the issue is resolved'),
      },
    },
    handleIssueCreateExecute,
  )
}
