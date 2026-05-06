import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readManifest, writeManifest } from './manifest.js'
import { type Manifest, ManifestError } from './types.js'

describe('readManifest', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'manifest-test-'))
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  it('returns empty manifest when file does not exist', () => {
    expect.assertions(2)
    const result = readManifest(tmpDir)
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual({})
  })

  it('parses valid manifest JSON', () => {
    expect.assertions(2)
    const manifest = {
      hooks: { fetchedAt: '2026-03-24T00:00:00Z', lastModified: 'Tue, 24 Mar 2026 00:00:00 GMT' },
    }
    writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest))

    const result = readManifest(tmpDir)
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual(manifest)
  })

  it('returns ManifestError for malformed JSON', () => {
    expect.assertions(2)
    writeFileSync(path.join(tmpDir, 'manifest.json'), '{ invalid json')

    const result = readManifest(tmpDir)
    expect(result.isErr()).toBeTruthy()
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(ManifestError)
  })
})

describe('writeManifest', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'manifest-test-'))
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  it('writes valid manifest JSON', async () => {
    expect.assertions(2)
    const manifest: Manifest = {
      hooks: { fetchedAt: '2026-03-24T00:00:00Z', lastModified: 'Tue, 24 Mar 2026 00:00:00 GMT' },
    }

    const result = await writeManifest(tmpDir, manifest)
    expect(result.isOk()).toBeTruthy()

    const written: unknown = JSON.parse(readFileSync(path.join(tmpDir, 'manifest.json'), 'utf8'))
    expect(written).toStrictEqual(manifest)
  })
})
