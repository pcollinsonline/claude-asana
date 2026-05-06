import { type ResultAsync, errAsync, okAsync } from 'neverthrow'

import { type LogFileError, createLogStage } from '@packages/plugins-base'

import { type ConfigError, isLoggingEnabled } from './config.js'
import { LOG_DIR } from './paths.js'

/**
 * Creates a logging stage that respects runtime config.
 * If logging is disabled for this hook, returns a no-op stage.
 * If the config is malformed, returns a stage that propagates the error.
 */
export const createHookLogger = <T extends Record<string, unknown>>(
  hookName: string,
): ((input: T) => ResultAsync<void, ConfigError | LogFileError>) => {
  const configResult = isLoggingEnabled(hookName)

  if (configResult.isErr()) {
    return () => errAsync(configResult.error)
  }

  if (!configResult.value) {
    // eslint-disable-next-line effect/no-eta-expansion -- wrapper discards input arg to return void
    return () => okAsync()
  }

  return createLogStage<T>(`${LOG_DIR}/${hookName}.jsonl`)
}
