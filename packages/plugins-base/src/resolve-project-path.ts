/**
 * Resolves a relative file path against the project root.
 *
 * Resolution order: explicit `projectDir` argument (for adapter use),
 * then CLAUDE_PROJECT_DIR env var (injected by Claude Code hooks),
 * then process.cwd() as a universal fallback.
 */

import path from 'node:path'

export const resolveProjectPath = (filePath: string, projectDir?: string): string =>
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- CLAUDE_PROJECT_DIR is injected by the agent runtime
  path.resolve(projectDir ?? process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd(), filePath)
