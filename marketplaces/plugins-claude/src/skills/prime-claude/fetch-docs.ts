/**
 * fetchDocs — Fetches documentation from the web and writes them to the
 * plugin's persistent data directory, with conditional fetch support
 * via If-Modified-Since / 304 Not Modified.
 */

import { errAsync, ResultAsync } from 'neverthrow'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { readManifest, writeManifest } from './manifest.js'
import { type FetchResult, type Manifest, type ManifestError, DocFetchError } from './types.js'

interface FetchOneResult {
  readonly content: string | null
  readonly lastModified: string | null
}

/**
 * Fetch a single documentation page with conditional request support.
 * Returns null content on 304 (not modified).
 */
const fetchOne = (
  url: string,
  lastModified: string | null,
): ResultAsync<FetchOneResult, DocFetchError> =>
  ResultAsync.fromPromise(
    fetch(url, {
      headers: lastModified ? { 'If-Modified-Since': lastModified } : {},
    }).then((res) => {
      if (res.status === 304) {
        return { content: null, lastModified }
      }
      if (!res.ok) {
        throw new DocFetchError(url, `HTTP ${res.status}`, res.status)
      }
      return res.text().then((content) => ({
        content,
        lastModified: res.headers.get('Last-Modified'),
      }))
    }),
    (error) =>
      error instanceof DocFetchError
        ? error
        : new DocFetchError(url, error instanceof Error ? error.message : String(error), undefined),
  )

/**
 * Fetch documentation pages and write them to the given directory.
 * Uses conditional requests when a manifest with Last-Modified data exists.
 *
 * @param docsDir - Absolute path to write docs into
 * @param registry - Doc name → URL mapping
 * @param names - Doc names to fetch (defaults to all registry entries)
 * @returns List of fetch results with per-doc status
 */
export const fetchDocs = (
  docsDir: string,
  registry: ReadonlyMap<string, string>,
  names?: readonly string[],
  force?: boolean,
): ResultAsync<readonly FetchResult[], DocFetchError | ManifestError> => {
  const entries = names
    ? names
        .map((n) => [n, registry.get(n)] as const)
        .filter((e): e is [string, string] => e[1] != null)
    : [...registry.entries()]

  if (entries.length === 0) {
    return errAsync(
      new DocFetchError(
        '',
        `No matching docs in registry. Available: ${[...registry.keys()].join(', ')}`,
        undefined,
      ),
    )
  }

  // Read existing manifest for conditional fetch headers
  const manifestResult = readManifest(docsDir)
  if (manifestResult.isErr()) {
    return errAsync(manifestResult.error)
  }
  const manifest: Manifest = { ...manifestResult.value }

  return ResultAsync.fromPromise(
    mkdir(docsDir, { recursive: true }),
    (error) =>
      new DocFetchError(
        docsDir,
        `Failed to create docs directory: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
      ),
  ).andThen(() => {
    const fetches = entries.map(([name, url]) => {
      const existing = manifest[name]
      const lastModified = force ? null : (existing?.lastModified ?? null)

      return fetchOne(url, lastModified).andThen(
        (result): ResultAsync<FetchResult, DocFetchError> => {
          if (result.content === null) {
            // 304 Not Modified — content unchanged
            return ResultAsync.fromSafePromise(
              Promise.resolve({ name, status: 'up-to-date' as const }),
            )
          }

          // 200 — write new content and update manifest entry
          return ResultAsync.fromPromise(
            writeFile(path.join(docsDir, `${name}.md`), result.content, 'utf8').then(() => {
              manifest[name] = {
                fetchedAt: new Date().toISOString(),
                lastModified: result.lastModified,
              }
              return { name, status: 'fetched' as const } satisfies FetchResult
            }),
            (error) =>
              new DocFetchError(
                url,
                `Failed to write ${name}.md: ${error instanceof Error ? error.message : String(error)}`,
                undefined,
              ),
          )
        },
      )
    })

    return ResultAsync.combine(fetches).andThen((results) =>
      writeManifest(docsDir, manifest).map(() => results),
    )
  })
}
