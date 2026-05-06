import type { Dirent } from 'node:fs'

import JSZip from 'jszip'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  archiveLogs,
  ClearLogsError,
  collectLogFiles,
  deleteLogFiles,
  formatTimestamp,
} from './clear-logs.js'

vi.mock('node:fs/promises')
vi.mock('@packages/plugins-base', () => ({
  resolveProjectPath: vi.fn((p: string) => `/project/${p}`),
}))

const mockReaddir = readdir as unknown as ReturnType<typeof vi.fn<() => Promise<Dirent[]>>>
const mockRm = vi.mocked(rm)
const mockReadFile = vi.mocked(readFile)
const mockWriteFile = vi.mocked(writeFile)
const mockMkdir = mkdir as unknown as ReturnType<typeof vi.fn<() => Promise<void>>>

const makeDirent = (name: string, isFile = true): Dirent =>
  ({
    isDirectory: () => !isFile,
    isFile: () => isFile,
    name,
  }) as Dirent

describe('formatTimestamp', () => {
  it('formats a date as YYYYMMDD-HHMMSS-mmm', () => {
    expect.assertions(1)
    const date = new Date(2026, 2, 23, 14, 15, 7, 42)
    expect(formatTimestamp(date)).toBe('20260323-141507-042')
  })

  it('zero-pads all fields', () => {
    expect.assertions(1)
    const date = new Date(2026, 0, 3, 1, 2, 3, 4)
    expect(formatTimestamp(date)).toBe('20260103-010203-004')
  })
})

describe('collectLogFiles', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns file names from the log directory', async () => {
    expect.assertions(1)
    mockReaddir.mockResolvedValue([
      makeDirent('session_start.json'),
      makeDirent('pre_tool_use.json'),
    ])

    const result = await collectLogFiles('/logs')

    expect(result._unsafeUnwrap()).toStrictEqual(['session_start.json', 'pre_tool_use.json'])
  })

  it('filters out directories', async () => {
    expect.assertions(1)
    mockReaddir.mockResolvedValue([makeDirent('session_start.json'), makeDirent('subdir', false)])

    const result = await collectLogFiles('/logs')

    expect(result._unsafeUnwrap()).toStrictEqual(['session_start.json'])
  })

  it('returns empty array when directory does not exist', async () => {
    expect.assertions(1)
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReaddir.mockRejectedValue(enoent)

    const result = await collectLogFiles('/logs')

    expect(result._unsafeUnwrap()).toStrictEqual([])
  })

  it('returns error for non-ENOENT failures', async () => {
    expect.assertions(1)
    mockReaddir.mockRejectedValue(new Error('EACCES'))

    const result = await collectLogFiles('/logs')

    expect(result.isErr()).toBeTruthy()
  })
})

describe('archiveLogs', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates a zip archive containing all log files', async () => {
    expect.assertions(3)
    mockReadFile.mockResolvedValue('{"data": true}')
    mockMkdir.mockResolvedValue()
    mockWriteFile.mockResolvedValue()

    const result = await archiveLogs('/logs', '/archives', ['a.json', 'b.json'])

    expect(result.isOk()).toBeTruthy()
    expect(mockMkdir).toHaveBeenCalledWith('/archives', { recursive: true })
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringMatching(/^\/archives\/\d{8}-\d{6}-\d{3}_logs\.zip$/),
      expect.any(Buffer),
    )
  })

  it('archive contains the correct files', async () => {
    expect.assertions(2)
    let writtenBuffer: Buffer | undefined
    mockReadFile.mockImplementation(
      // @ts-expect-error -- readFile overloads; we only care about (string, 'utf8') path
      (filePath: string) => Promise.resolve(filePath.includes('a.json') ? '{"a": 1}' : '{"b": 2}'),
    )
    mockMkdir.mockResolvedValue()
    mockWriteFile.mockImplementation((_path, data) => {
      writtenBuffer = data as Buffer
      return Promise.resolve()
    })

    await archiveLogs('/logs', '/archives', ['a.json', 'b.json'])

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- writtenBuffer is assigned by mock
    const zip = await JSZip.loadAsync(writtenBuffer!)
    await expect(zip.file('a.json')?.async('string')).resolves.toBe('{"a": 1}')
    await expect(zip.file('b.json')?.async('string')).resolves.toBe('{"b": 2}')
  })

  it('returns error when readFile fails', async () => {
    expect.assertions(1)
    mockReadFile.mockRejectedValue(new Error('read failed'))

    const result = await archiveLogs('/logs', '/archives', ['a.json'])

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(ClearLogsError)
  })
})

describe('deleteLogFiles', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deletes all specified files and returns count', async () => {
    expect.assertions(3)
    mockRm.mockResolvedValue()

    const result = await deleteLogFiles('/logs', ['a.json', 'b.json'])

    expect(result._unsafeUnwrap()).toBe(2)
    expect(mockRm).toHaveBeenCalledWith(path.join('/logs', 'a.json'))
    expect(mockRm).toHaveBeenCalledWith(path.join('/logs', 'b.json'))
  })

  it('returns error when rm fails', async () => {
    expect.assertions(1)
    mockRm.mockRejectedValue(new Error('permission denied'))

    const result = await deleteLogFiles('/logs', ['a.json'])

    expect(result._unsafeUnwrapErr()).toBeInstanceOf(ClearLogsError)
  })
})
