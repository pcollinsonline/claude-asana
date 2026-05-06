/**
 * Append structured entries to JSON Lines log files.
 *
 * Each entry is written as a single-line JSON object followed by a newline.
 * Uses appendFile for O(1) writes instead of read-parse-rewrite.
 * Creates parent directories if needed.
 */

import { ResultAsync } from 'neverthrow'
import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

import { LogFileError } from './types.js'

/**
 * Appends a structured entry to a JSON Lines log file.
 */
export const appendLogEntry = (filePath: string, entry: unknown): ResultAsync<void, LogFileError> =>
  ResultAsync.fromPromise(
    (async () => {
      await mkdir(path.dirname(filePath), { recursive: true })
      await appendFile(filePath, JSON.stringify(entry) + '\n')
    })(),
    (error) =>
      new LogFileError(
        `Failed to write log file: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
  )
