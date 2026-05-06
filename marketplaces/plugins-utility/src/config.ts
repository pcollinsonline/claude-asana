import { type Result, err, fromThrowable, ok } from 'neverthrow'
import { readFileSync } from 'node:fs'

import { resolveProjectPath } from '@packages/plugins-base'

import { CONFIG_PATH } from './paths.js'

export class ConfigError extends Error {
  readonly _tag = 'ConfigError' as const
  override readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ConfigError'
    this.cause = cause
  }
}

interface PluginConfig {
  logging?: {
    disabled?: string[]
  }
}

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

const loadConfig = (): Result<PluginConfig, ConfigError> => {
  const fileResult = safeReadFile(resolveProjectPath(CONFIG_PATH))

  // Missing file is not an error — config is optional
  if (fileResult.isErr()) return ok({})

  return safeJsonParse(fileResult.value).andThen((parsed) =>
    typeof parsed === 'object' && parsed !== null
      ? // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- structural check above validates shape
        ok(parsed as PluginConfig)
      : err(new ConfigError('Config file must contain a JSON object')),
  )
}

/**
 * Returns Ok(true) if logging is enabled for the given hook name,
 * Ok(false) if disabled, or Err(ConfigError) if the config is malformed.
 * hookName should be the snake_case log file stem (e.g. "session_start").
 */
export const isLoggingEnabled = (hookName: string): Result<boolean, ConfigError> =>
  loadConfig().map((config) => {
    const disabled = config.logging?.disabled ?? []
    return !disabled.includes(hookName)
  })
