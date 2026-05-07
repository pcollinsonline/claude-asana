import { resolveProjectPath } from '@packages/plugins-base'
import JSZip from 'jszip'
import { errAsync, okAsync, ResultAsync } from 'neverthrow'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ARCHIVE_DIR, LOG_DIR } from '../../paths.js'

export class ClearLogsError extends Error {
  readonly _tag = 'ClearLogsError' as const
  override readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ClearLogsError'
    this.cause = cause
  }
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0')

export const formatTimestamp = (date: Date = new Date()): string =>
  [
    pad(date.getFullYear(), 4),
    pad(date.getMonth() + 1, 2),
    pad(date.getDate(), 2),
    '-',
    pad(date.getHours(), 2),
    pad(date.getMinutes(), 2),
    pad(date.getSeconds(), 2),
    '-',
    pad(date.getMilliseconds(), 3),
  ].join('')

export const collectLogFiles = (logDir: string): ResultAsync<string[], ClearLogsError> =>
  ResultAsync.fromPromise(readdir(logDir, { withFileTypes: true }), (error) => error)
    .map((entries) => entries.filter((e) => e.isFile()).map((e) => e.name))
    .orElse((error) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return okAsync<string[], ClearLogsError>([])
      return errAsync(new ClearLogsError(`Failed to read log directory: ${String(error)}`, error))
    })

export const archiveLogs = (
  logDir: string,
  archiveDir: string,
  files: string[],
): ResultAsync<string, ClearLogsError> =>
  ResultAsync.fromPromise(
    (async () => {
      const zip = new JSZip()

      for (const file of files) {
        const content = await readFile(path.join(logDir, file), 'utf8')
        zip.file(file, content)
      }

      const buffer = await zip.generateAsync({ type: 'nodebuffer' })
      const archiveName = `${formatTimestamp()}_logs.zip`
      const archivePath = path.join(archiveDir, archiveName)

      await mkdir(archiveDir, { recursive: true })
      await writeFile(archivePath, buffer)

      return archivePath
    })(),
    (error) => new ClearLogsError(`Failed to archive logs: ${String(error)}`, error),
  )

export const deleteLogFiles = (
  logDir: string,
  files: string[],
): ResultAsync<number, ClearLogsError> =>
  ResultAsync.fromPromise(
    (async () => {
      await Promise.all(files.map((file) => rm(path.join(logDir, file))))
      return files.length
    })(),
    (error) => new ClearLogsError(`Failed to delete log files: ${String(error)}`, error),
  )

const main = async (): Promise<void> => {
  const arg = process.argv[2]?.toLowerCase()
  const mode = arg === 'archive' ? 'archive' : 'clear'
  const logDir = resolveProjectPath(LOG_DIR)
  const archiveDir = resolveProjectPath(ARCHIVE_DIR)

  const result = await collectLogFiles(logDir).andThen((files) => {
    if (files.length === 0) {
      console.log('No log files to clear.')
      return okAsync(0)
    }

    if (mode === 'archive') {
      return archiveLogs(logDir, archiveDir, files).andThen((archivePath) => {
        console.log(`Archived ${String(files.length)} log files to ${archivePath}`)
        return deleteLogFiles(logDir, files)
      })
    }

    return deleteLogFiles(logDir, files)
  })

  if (result.isErr()) {
    console.error(`clear-logs error: ${result.error.message}`)
    process.exitCode = 1
  } else if (result.value > 0) {
    console.log(`Deleted ${String(result.value)} log files.`)
  }
}

// Guard: only run when executed directly (not when imported by tests)
const isDirectExecution = process.argv[1]?.endsWith('clear-logs.js') ?? false
if (isDirectExecution) void main()
