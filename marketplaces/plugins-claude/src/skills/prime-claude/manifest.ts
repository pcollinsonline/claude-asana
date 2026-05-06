/**
 * manifest — Reads and writes the docs manifest file that tracks
 * fetch metadata (Last-Modified headers, fetch timestamps) per doc.
 */

import { type Result, fromThrowable, ok, ResultAsync } from 'neverthrow'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { type Manifest, ManifestError } from './types.js'

const MANIFEST_FILENAME = 'manifest.json'

const safeReadFile = fromThrowable(
  (filePath: string) => readFileSync(filePath, 'utf8'),
  (error) => error,
)

const safeJsonParse = fromThrowable(
  // eslint-disable-next-line effect/no-eta-expansion -- return type annotation narrows any → unknown
  (content: string): unknown => JSON.parse(content),
  (error) =>
    new ManifestError(
      `Failed to parse manifest JSON: ${error instanceof Error ? error.message : String(error)}`,
      error,
    ),
)

/**
 * Read the manifest from the docs directory.
 * Returns an empty manifest if the file does not exist.
 */
export const readManifest = (docsDir: string): Result<Manifest, ManifestError> => {
  const filePath = path.join(docsDir, MANIFEST_FILENAME)
  const fileResult = safeReadFile(filePath)

  // Missing file is not an error — no manifest means nothing has been fetched yet
  if (fileResult.isErr()) return ok({})

  return safeJsonParse(fileResult.value).map(
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- structural check deferred; manifest is internally written
    (parsed) => parsed as Manifest,
  )
}

/**
 * Write the manifest to the docs directory.
 */
export const writeManifest = (
  docsDir: string,
  manifest: Manifest,
): ResultAsync<void, ManifestError> =>
  ResultAsync.fromPromise(
    writeFile(path.join(docsDir, MANIFEST_FILENAME), JSON.stringify(manifest, null, 2), 'utf8'),
    (error) =>
      new ManifestError(
        `Failed to write manifest: ${error instanceof Error ? error.message : String(error)}`,
        error,
      ),
  )
