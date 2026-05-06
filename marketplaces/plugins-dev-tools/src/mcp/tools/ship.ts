/**
 * MCP tool for ship-it preflight checks: ship_preflight.
 *
 * Validates GitHub auth, checks branch (cannot ship from main/master),
 * fetches the target branch, and detects divergence so the caller knows
 * whether a rebase is needed before pushing.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { execFileSync } from 'node:child_process'
import { z } from 'zod'

import { checkGhAuth, getCurrentBranch, getRepoRoot } from './_shared.js'

interface ToolResult {
  [key: string]: unknown
  content: { text: string; type: 'text' }[]
  isError?: true
}

/**
 * MCP handler for `ship_preflight`. Runs auth check, branch validation,
 * target-branch fetch, and ancestor check (divergence detection).
 */
export const handleShipPreflight = ({
  targetBranch,
}: {
  targetBranch: string | undefined
}): ToolResult => {
  try {
    const target = targetBranch ?? 'main'

    // Auth check
    const auth = checkGhAuth()
    if (!auth.authenticated) {
      return {
        content: [
          {
            text: JSON.stringify({
              error: 'GitHub CLI not authenticated. Run `gh auth login` first.',
              success: false,
              validation: { error: 'not_authenticated', valid: false },
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    // Current branch
    const branch = getCurrentBranch()

    if (branch === 'main' || branch === 'master') {
      return {
        content: [
          {
            text: JSON.stringify({
              branch,
              error: 'Cannot ship from the main branch.',
              success: false,
              targetBranch: target,
              validation: { error: 'main_branch', valid: false },
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    const root = getRepoRoot()

    // Uncommitted changes check
    const statusOutput = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const hasUncommittedChanges = statusOutput.length > 0

    // Fetch target branch
    let fetchError: string | null = null
    try {
      execFileSync('git', ['fetch', 'origin', target], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      fetchError = error instanceof Error ? error.message : String(error)
    }

    // Divergence check: verify branch includes all changes from target
    let isBehindTarget = false
    if (!fetchError) {
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', `origin/${target}`, 'HEAD'], {
          cwd: root,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        // exit code 0 means origin/target IS an ancestor of HEAD — we are up to date
        isBehindTarget = false
      } catch {
        // exit code 1 means origin/target is NOT an ancestor — we are behind
        isBehindTarget = true
      }
    }

    if (isBehindTarget) {
      return {
        content: [
          {
            text: JSON.stringify({
              branch,
              error: `Your branch is behind ${target}. Please rebase or merge before shipping.`,
              hasUncommittedChanges,
              success: false,
              targetBranch: target,
              validation: { error: 'behind_target', valid: false },
            }),
            type: 'text',
          },
        ],
        isError: true,
      }
    }

    return {
      content: [
        {
          text: JSON.stringify({
            branch,
            fetchError,
            hasUncommittedChanges,
            success: true,
            targetBranch: target,
            username: auth.username,
            validation: { valid: true },
            warning: hasUncommittedChanges
              ? 'You have uncommitted changes. Consider committing before shipping.'
              : null,
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

/** Register the ship_preflight tool on the MCP server. */
export const registerShipTools = (server: McpServer): void => {
  server.registerTool(
    'ship_preflight',
    {
      annotations: { readOnlyHint: true },
      description:
        'Run ship-it preflight checks: verify GitHub auth, validate current branch is not main/master, fetch the target branch, and detect divergence. Returns validation result and warnings.',
      inputSchema: {
        targetBranch: z.string().optional().describe('Base branch to ship to (default: "main")'),
      },
    },
    handleShipPreflight,
  )
}
