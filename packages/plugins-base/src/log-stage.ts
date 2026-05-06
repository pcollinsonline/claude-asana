/**
 * createLogStage — Factory for creating pipeline stages that log hook input.
 *
 * Produces a function that enriches input with a `logged_at` timestamp
 * and appends it to the specified JSON log file.
 *
 * File paths are resolved against the project root (via resolveProjectPath)
 * so logs always go to `<project-root>/logs/` regardless of process cwd.
 */

import type { ResultAsync } from 'neverthrow'

import type { LogFileError } from './types.js'

import { appendLogEntry } from './log-file.js'
import { resolveProjectPath } from './resolve-project-path.js'

/**
 * Creates a logging stage for a specific log file path.
 * The returned function accepts any hook input and logs it with a timestamp.
 */
export const createLogStage =
  <T extends Record<string, unknown>>(filePath: string) =>
  (input: T): ResultAsync<void, LogFileError> =>
    appendLogEntry(resolveProjectPath(filePath), {
      ...input,
      logged_at: new Date().toISOString(),
    })
