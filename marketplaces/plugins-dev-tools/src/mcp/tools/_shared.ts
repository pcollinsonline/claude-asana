import { execFileSync, execSync } from 'node:child_process'

let repoRoot: string | null = null

// Exported for test isolation only — resets the cached repo root between test runs
export const _resetRepoRoot = (): void => {
  repoRoot = null
}

/** Return the absolute path to the git repo root, cached after first call. */
export const getRepoRoot = (): string => {
  repoRoot ??= execSync('git rev-parse --show-toplevel', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
  return repoRoot
}

export const getCurrentBranch = (): string => {
  const output = execSync('git rev-parse --abbrev-ref HEAD', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return output.trim()
}

/** Extract a GitHub issue number from a branch name containing `/gh-N`. */
export const extractIssueNumber = (branchName: string): number | null => {
  const match = /\/gh-(\d+)/.exec(branchName)
  return match ? Number(match[1]) : null
}

export interface GhAuthResult {
  authenticated: boolean
  username: string | null
}

/**
 * Check GitHub CLI authentication status.
 * Returns whether the user is logged in and their username if available.
 */
export const checkGhAuth = (): GhAuthResult => {
  try {
    const output = execFileSync('gh', ['auth', 'status'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const authenticated = output.includes('Logged in')
    const usernameMatch = /account (\S+)/.exec(output)
    return { authenticated, username: usernameMatch?.[1] ?? null }
  } catch {
    return { authenticated: false, username: null }
  }
}
