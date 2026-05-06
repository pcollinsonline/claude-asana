/**
 * Types for the prime-claude skill.
 *
 * This is a skill preprocessor (not a lifecycle hook),
 * so it does not use SDK hook input/output types.
 */

/**
 * A resolved documentation file with its name and content.
 */
export interface ResolvedDoc {
  readonly content: string
  readonly name: string
}

/**
 * Error when a requested doc name cannot be matched to any available doc.
 */
export class DocNotFoundError extends Error {
  readonly _tag = 'DocNotFoundError' as const
  readonly available: readonly string[]
  readonly query: string
  constructor(query: string, available: readonly string[]) {
    super(`Could not find documentation matching '${query}'`)
    this.name = 'DocNotFoundError'
    this.query = query
    this.available = available
  }
}

/**
 * Error when fetching a documentation page fails.
 */
export class DocFetchError extends Error {
  readonly _tag = 'DocFetchError' as const
  readonly statusCode: number | undefined
  readonly url: string
  constructor(url: string, reason: string, statusCode?: number) {
    super(`Failed to fetch ${url}: ${reason}`)
    this.name = 'DocFetchError'
    this.url = url
    this.statusCode = statusCode
  }
}

/**
 * Error when reading or writing the docs manifest fails.
 */
export class ManifestError extends Error {
  readonly _tag = 'ManifestError' as const
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ManifestError'
    this.cause = cause
  }
}

/**
 * Error when reading or parsing the plugin config fails.
 */
export class ConfigError extends Error {
  readonly _tag = 'ConfigError' as const
  override readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ConfigError'
    this.cause = cause
  }
}

/**
 * A single entry in the docs manifest tracking fetch metadata.
 */
export interface ManifestEntry {
  readonly fetchedAt: string
  readonly lastModified: string | null
}

/**
 * Manifest mapping doc names to their fetch metadata.
 */
export type Manifest = Record<string, ManifestEntry>

/**
 * Result of fetching a single doc — either freshly fetched or unchanged.
 */
export interface FetchResult {
  readonly name: string
  readonly status: 'fetched' | 'up-to-date'
}

/**
 * Plugin config for prime-claude, loaded from .ai/plugins-claude/config.json.
 */
export interface PrimeClaudeConfig {
  readonly 'prime-claude'?: {
    readonly docs?: {
      readonly additional?: Readonly<Record<string, string>>
      readonly disabled?: readonly string[]
    }
  }
}
