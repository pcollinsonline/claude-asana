/**
 * Shared utilities for reading and parsing Claude Code hook input from stdin.
 *
 * Every hook CLI reads JSON from stdin and parses it into a typed input.
 * These functions are extracted here to avoid duplication across hook entry points.
 */

import { Result, ResultAsync } from 'neverthrow'

import { HookInputError } from './types.js'

/**
 * Reads all data from stdin as a string.
 */
export const readStdin = (): ResultAsync<string, HookInputError> =>
  ResultAsync.fromPromise(
    new Promise<string>((resolve, reject) => {
      // Handle case where stdin is already closed (no piped input)
      if (process.stdin.readableEnded) {
        resolve('')
        return
      }

      const chunks: Buffer[] = []

      process.stdin.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      process.stdin.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'))
      })

      process.stdin.on('error', (err: Error) => {
        reject(err)
      })
    }),
    (error) => new HookInputError(error instanceof Error ? error.message : String(error), error),
  )

/**
 * Parses JSON input from stdin into the specified hook input type.
 */
export const parseHookInput = <T>(input: string): Result<T, HookInputError> =>
  Result.fromThrowable(
    () => JSON.parse(input) as T,
    (error) =>
      new HookInputError(
        `Failed to parse hook input: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
  )()
