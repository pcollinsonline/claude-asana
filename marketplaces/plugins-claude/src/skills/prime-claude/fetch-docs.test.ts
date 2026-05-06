import { existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { BUILTIN_DOC_REGISTRY } from './doc-registry.js'
import { fetchDocs } from './fetch-docs.js'
import { DocFetchError } from './types.js'

const mockFetch = vi.fn<(input: Request | URL | string, init?: RequestInit) => Promise<Response>>()

const mockResponse = (body: string, status = 200, headers?: Record<string, string>): Response => {
  // Response constructor rejects 304 — use a real Response for valid statuses,
  // fall back to a minimal mock for 304.
  if (status === 304) {
    return {
      headers: new Headers(headers),
      ok: false,
      status: 304,
      statusText: 'Not Modified',
      text: () => Promise.resolve(body),
    } as unknown as Response
  }
  return new Response(body, {
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    ...(headers ? { headers } : {}),
  })
}

describe('fetchDocs', () => {
  let tmpDir: string

  beforeAll(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), 'fetch-docs-test-'))
    mockFetch.mockReset()
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('fetches all docs when no names specified', async () => {
    expect.hasAssertions()
    // Each call needs a fresh Response (body is consumed once), so mockImplementation is required here.
    // eslint-disable-next-line vitest/prefer-mock-promise-shorthand -- Response body can only be consumed once; each call needs a fresh instance
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        mockResponse('# Test doc content', 200, {
          'Last-Modified': 'Tue, 24 Mar 2026 00:00:00 GMT',
        }),
      ),
    )

    const docsDir = path.join(tmpDir, 'docs')
    const result = await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY)

    expect(result.isOk()).toBeTruthy()
    const results = result._unsafeUnwrap()
    expect(results).toHaveLength(BUILTIN_DOC_REGISTRY.size)
    expect(mockFetch).toHaveBeenCalledTimes(BUILTIN_DOC_REGISTRY.size)

    for (const r of results) {
      expect(r.status).toBe('fetched')
      const filePath = path.join(docsDir, `${r.name}.md`)
      expect(existsSync(filePath)).toBeTruthy()
      expect(readFileSync(filePath, 'utf8')).toBe('# Test doc content')
    }

    // Manifest should be written
    const manifestPath = path.join(docsDir, 'manifest.json')
    expect(existsSync(manifestPath)).toBeTruthy()
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
      string,
      { lastModified: string }
    >
    expect(Object.keys(manifest)).toHaveLength(BUILTIN_DOC_REGISTRY.size)
    expect(manifest['hooks']?.lastModified).toBe('Tue, 24 Mar 2026 00:00:00 GMT')
  })

  it('fetches specific docs by name', async () => {
    expect.hasAssertions()
    mockFetch.mockResolvedValue(
      mockResponse('# Hooks content', 200, { 'Last-Modified': 'Mon, 23 Mar 2026 12:00:00 GMT' }),
    )

    const docsDir = path.join(tmpDir, 'docs')
    const result = await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    expect(result.isOk()).toBeTruthy()
    const results = result._unsafeUnwrap()
    expect(results).toStrictEqual([{ name: 'hooks', status: 'fetched' }])
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenCalledWith(
      BUILTIN_DOC_REGISTRY.get('hooks'),
      expect.objectContaining({ headers: {} }),
    )
  })

  it('creates the docs directory if it does not exist', async () => {
    expect.hasAssertions()
    mockFetch.mockResolvedValue(mockResponse('# Content'))

    const docsDir = path.join(tmpDir, 'nested', 'docs')
    const result = await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    expect(result.isOk()).toBeTruthy()
    expect(existsSync(path.join(docsDir, 'hooks.md'))).toBeTruthy()
  })

  it('returns error on HTTP failure', async () => {
    expect.hasAssertions()
    mockFetch.mockResolvedValue(mockResponse('Not Found', 404))

    const docsDir = path.join(tmpDir, 'docs')
    const result = await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    expect(result.isErr()).toBeTruthy()
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(DocFetchError)
    expect((error as DocFetchError).statusCode).toBe(404)
  })

  it('returns error on network failure', async () => {
    expect.hasAssertions()
    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    const docsDir = path.join(tmpDir, 'docs')
    const result = await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    expect(result.isErr()).toBeTruthy()
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(DocFetchError)
    expect(error.message).toContain('fetch failed')
  })

  it('returns error when no names match the registry', async () => {
    expect.hasAssertions()
    const docsDir = path.join(tmpDir, 'docs')
    const result = await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['nonexistent'])

    expect(result.isErr()).toBeTruthy()
    const error = result._unsafeUnwrapErr()
    expect(error).toBeInstanceOf(DocFetchError)
    expect(error.message).toContain('No matching docs')
  })

  it('sends If-Modified-Since when manifest has lastModified', async () => {
    expect.hasAssertions()
    // First fetch to create manifest
    mockFetch.mockResolvedValueOnce(
      mockResponse('# Hooks', 200, { 'Last-Modified': 'Mon, 23 Mar 2026 12:00:00 GMT' }),
    )
    const docsDir = path.join(tmpDir, 'docs')
    await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    // Second fetch should send If-Modified-Since and get 304
    mockFetch.mockResolvedValueOnce(mockResponse('', 304))
    const result = await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    expect(result.isOk()).toBeTruthy()
    const results = result._unsafeUnwrap()
    expect(results).toStrictEqual([{ name: 'hooks', status: 'up-to-date' }])

    expect(mockFetch).toHaveBeenLastCalledWith(
      BUILTIN_DOC_REGISTRY.get('hooks'),
      expect.objectContaining({
        headers: { 'If-Modified-Since': 'Mon, 23 Mar 2026 12:00:00 GMT' },
      }),
    )
  })

  it('skips file write on 304 Not Modified', async () => {
    expect.hasAssertions()
    // First fetch
    mockFetch.mockResolvedValueOnce(
      mockResponse('# Original', 200, { 'Last-Modified': 'Mon, 23 Mar 2026 12:00:00 GMT' }),
    )
    const docsDir = path.join(tmpDir, 'docs')
    await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    const originalContent = readFileSync(path.join(docsDir, 'hooks.md'), 'utf8')

    // Second fetch returns 304
    mockFetch.mockResolvedValueOnce(mockResponse('', 304))
    await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    // File should remain unchanged
    expect(readFileSync(path.join(docsDir, 'hooks.md'), 'utf8')).toBe(originalContent)
  })

  it('bypasses conditional fetch when force is true', async () => {
    expect.hasAssertions()
    // First fetch to create manifest with lastModified
    mockFetch.mockResolvedValueOnce(
      mockResponse('# Hooks v1', 200, { 'Last-Modified': 'Mon, 23 Mar 2026 12:00:00 GMT' }),
    )
    const docsDir = path.join(tmpDir, 'docs')
    await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'])

    // Second fetch with force — should NOT send If-Modified-Since
    mockFetch.mockResolvedValueOnce(
      mockResponse('# Hooks v2', 200, { 'Last-Modified': 'Tue, 24 Mar 2026 00:00:00 GMT' }),
    )
    const result = await fetchDocs(docsDir, BUILTIN_DOC_REGISTRY, ['hooks'], true)

    expect(result.isOk()).toBeTruthy()
    const results = result._unsafeUnwrap()
    expect(results).toStrictEqual([{ name: 'hooks', status: 'fetched' }])

    // Should have been called without If-Modified-Since header
    expect(mockFetch).toHaveBeenLastCalledWith(
      BUILTIN_DOC_REGISTRY.get('hooks'),
      expect.objectContaining({ headers: {} }),
    )

    // File should have new content
    expect(readFileSync(path.join(docsDir, 'hooks.md'), 'utf8')).toBe('# Hooks v2')
  })
})
