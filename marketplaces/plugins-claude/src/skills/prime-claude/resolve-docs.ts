/**
 * resolveDocs — Resolves documentation files from the plugin's
 * resources directory, with fuzzy matching support.
 *
 * Returns resolved doc data; callers handle formatting and output.
 */

import { type Result, errAsync, okAsync, ResultAsync } from 'neverthrow'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { fuzzyMatch } from './fuzzy-match.js'
import { readManifest } from './manifest.js'
import { type ManifestError, type ResolvedDoc, DocNotFoundError } from './types.js'

/**
 * Resolves the docs directory path from CLAUDE_PLUGIN_DATA.
 *
 * CLAUDE_PLUGIN_DATA is set automatically by Claude Code for installed plugins
 * and points to a persistent directory that survives plugin updates.
 */
export const resolveDocsDir = (): string => {
  const pluginData = process.env['CLAUDE_PLUGIN_DATA']
  if (!pluginData) {
    throw new Error(
      'CLAUDE_PLUGIN_DATA is not set. Run this skill via Claude Code or set the env var manually.',
    )
  }
  return path.join(pluginData, 'docs')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Match each argument to a doc name via fuzzy matching.
 * Returns deduplicated list of matched names or fails with DocNotFoundError.
 */
const matchArgs = (
  args: readonly string[],
  docNames: readonly string[],
): ResultAsync<readonly string[], DocNotFoundError> => {
  const matched: string[] = []
  for (const arg of args) {
    const result = fuzzyMatch(arg, docNames)
    if (result === null) {
      return errAsync(new DocNotFoundError(arg, docNames))
    }
    matched.push(result)
  }
  // Deduplicate
  return okAsync([...new Set(matched)])
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Resolve documentation files matching the given arguments.
 * Returns the matched docs with their content.
 */
export const resolveDocs = (
  args: readonly string[],
  allowedNames?: readonly string[],
): ResultAsync<ResolvedDoc[], DocNotFoundError | Error> => {
  const docsDir = resolveDocsDir()

  return ResultAsync.fromPromise(
    readdir(docsDir),
    (error) =>
      new Error(
        `Failed to read docs directory: ${error instanceof Error ? error.message : String(error)}`,
      ),
  ).andThen((entries) => {
    const mdFiles = entries.filter((f) => f.endsWith('.md'))
    let docNames = mdFiles.map((f) => path.basename(f, '.md'))

    // Filter to allowed names when provided (enforces disabled config)
    if (allowedNames) {
      const allowed = new Set(allowedNames)
      // eslint-disable-next-line effect/no-eta-expansion -- Set#has requires bound this context
      docNames = docNames.filter((n) => allowed.has(n))
    }
    const requestedNames = args.length === 0 ? okAsync(docNames) : matchArgs(args, docNames)

    return requestedNames.andThen((names) =>
      ResultAsync.fromPromise(
        Promise.all(
          names.map(async (name) => {
            const content = await readFile(path.join(docsDir, `${name}.md`), 'utf8')
            return { content, name } satisfies ResolvedDoc
          }),
        ),
        (error) =>
          new Error(
            `Failed to read doc file: ${error instanceof Error ? error.message : String(error)}`,
          ),
      ),
    )
  })
}

// ---------------------------------------------------------------------------
// Staleness check
// ---------------------------------------------------------------------------

const DEFAULT_STALENESS_THRESHOLD_DAYS = 30

/**
 * Check which of the given doc names have a fetchedAt older than the threshold.
 * Returns the list of stale doc names. Missing manifest entries are not
 * considered stale (they simply have no metadata).
 */
export const checkStaleness = (
  docsDir: string,
  docNames: readonly string[],
  thresholdDays: number = DEFAULT_STALENESS_THRESHOLD_DAYS,
): Result<readonly string[], ManifestError> =>
  readManifest(docsDir).map((manifest) => {
    const now = Date.now()
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000

    return docNames.filter((name) => {
      const entry = manifest[name]
      if (!entry?.fetchedAt) return false
      return now - new Date(entry.fetchedAt).getTime() > thresholdMs
    })
  })
