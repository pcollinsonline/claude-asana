/**
 * Shared error types for plugin hook infrastructure.
 */

export class HookInputError extends Error {
  readonly _tag = 'HookInputError' as const
  override readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'HookInputError'
    this.cause = cause
  }
}

export class LogFileError extends Error {
  readonly _tag = 'LogFileError' as const
  override readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'LogFileError'
    this.cause = cause
  }
}
