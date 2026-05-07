/**
 * config — Loads plugin configuration from .ai/plugins-claude/config.json.
 *
 * Follows the same pattern as @marketplace/plugins-utility config.ts:
 * sync read, optional file, neverthrow error handling.
 */

import { resolveProjectPath } from '@packages/plugins-base'
import { type Result, err, fromThrowable, ok } from 'neverthrow'
import { readFileSync } from 'node:fs'

import { CONFIG_PATH } from './paths.js'
import { type PrimeClaudeConfig, ConfigError } from './types.js'

const safeReadFile = fromThrowable(
  (filePath: string) => readFileSync(filePath, 'utf8'),
  (error) => error,
)

const safeJsonParse = fromThrowable(
  // eslint-disable-next-line effect/no-eta-expansion -- return type annotation narrows any → unknown
  (content: string): unknown => JSON.parse(content),
  (error) =>
    new ConfigError(
      `Failed to parse config JSON: ${error instanceof Error ? error.message : String(error)}`,
      error,
    ),
)

/**
 * Load the prime-claude config from the project's .ai directory.
 * Returns an empty config if the file does not exist.
 */
export const loadConfig = (): Result<PrimeClaudeConfig, ConfigError> => {
  const fileResult = safeReadFile(resolveProjectPath(CONFIG_PATH))

  // Missing file is not an error — config is optional
  if (fileResult.isErr()) return ok({})

  return safeJsonParse(fileResult.value).andThen((parsed) =>
    typeof parsed === 'object' && parsed !== null
      ? // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- structural check above validates shape
        ok(parsed as PrimeClaudeConfig)
      : err(new ConfigError('Config file must contain a JSON object')),
  )
}
