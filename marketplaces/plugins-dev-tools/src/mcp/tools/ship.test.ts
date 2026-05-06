import { execFileSync } from 'node:child_process'

import { checkGhAuth, getCurrentBranch } from './_shared.js'
import { handleShipPreflight } from './ship.js'

vi.mock('node:child_process')
vi.mock('./_shared.js', () => ({
  checkGhAuth: vi.fn(() => ({ authenticated: true, username: 'testuser' })),
  getCurrentBranch: vi.fn(() => 'feat/gh-42_add-widget'),
  getRepoRoot: vi.fn(() => '/mock/repo'),
}))

const mockExecFileSync = vi.mocked(execFileSync)
const mockCheckGhAuth = vi.mocked(checkGhAuth)
const mockGetCurrentBranch = vi.mocked(getCurrentBranch)

type ToolResult = ReturnType<typeof handleShipPreflight>

const parseContent = <T>(result: ToolResult): T =>
  JSON.parse(result.content.at(0)?.text ?? '{}') as T

interface PreflightSuccessResponse {
  branch: string
  fetchError: string | null
  hasUncommittedChanges: boolean
  success: true
  targetBranch: string
  username: string | null
  validation: { valid: true }
  warning: string | null
}

interface PreflightErrorResponse {
  branch?: string
  error: string
  hasUncommittedChanges?: boolean
  success: false
  targetBranch?: string
  validation: { error: string; valid: false }
}

describe('handleShipPreflight', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns success when all checks pass', () => {
    expect.assertions(5)
    // git status --porcelain (no changes)
    mockExecFileSync.mockReturnValueOnce('')
    // git fetch origin main
    mockExecFileSync.mockReturnValueOnce('')
    // git merge-base --is-ancestor
    mockExecFileSync.mockReturnValueOnce('')

    const result = handleShipPreflight({ targetBranch: 'main' })
    const data = parseContent<PreflightSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.branch).toBe('feat/gh-42_add-widget')
    expect(data.targetBranch).toBe('main')
    expect(data.validation.valid).toBeTruthy()
    expect(result.isError).toBeUndefined()
  })

  it('defaults targetBranch to main when not provided', () => {
    expect.assertions(1)
    mockExecFileSync.mockReturnValueOnce('')
    mockExecFileSync.mockReturnValueOnce('')
    mockExecFileSync.mockReturnValueOnce('')

    const result = handleShipPreflight({ targetBranch: undefined })
    const data = parseContent<PreflightSuccessResponse>(result)

    expect(data.targetBranch).toBe('main')
  })

  it('returns error when not authenticated', () => {
    expect.assertions(2)
    mockCheckGhAuth.mockReturnValueOnce({ authenticated: false, username: null })

    const result = handleShipPreflight({ targetBranch: 'main' })
    const data = parseContent<PreflightErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.validation.error).toBe('not_authenticated')
  })

  it('returns error when on main branch', () => {
    expect.assertions(3)
    mockGetCurrentBranch.mockReturnValueOnce('main')

    const result = handleShipPreflight({ targetBranch: 'main' })
    const data = parseContent<PreflightErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.validation.error).toBe('main_branch')
    expect(result.isError).toBeTruthy()
  })

  it('returns error when on master branch', () => {
    expect.assertions(2)
    mockGetCurrentBranch.mockReturnValueOnce('master')

    const result = handleShipPreflight({ targetBranch: 'main' })
    const data = parseContent<PreflightErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.validation.error).toBe('main_branch')
  })

  it('warns about uncommitted changes but still returns success', () => {
    expect.assertions(3)
    // git status --porcelain — has changes
    mockExecFileSync.mockReturnValueOnce('M src/index.ts\n')
    // git fetch
    mockExecFileSync.mockReturnValueOnce('')
    // git merge-base
    mockExecFileSync.mockReturnValueOnce('')

    const result = handleShipPreflight({ targetBranch: 'main' })
    const data = parseContent<PreflightSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.hasUncommittedChanges).toBeTruthy()
    expect(data.warning).toContain('uncommitted changes')
  })

  it('returns error when branch is behind target', () => {
    expect.assertions(3)
    // git status --porcelain
    mockExecFileSync.mockReturnValueOnce('')
    // git fetch
    mockExecFileSync.mockReturnValueOnce('')
    // git merge-base --is-ancestor — throws (exit code 1 means NOT ancestor)
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('not an ancestor')
    })

    const result = handleShipPreflight({ targetBranch: 'main' })
    const data = parseContent<PreflightErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.validation.error).toBe('behind_target')
    expect(result.isError).toBeTruthy()
  })

  it('records fetch error but continues when fetch fails', () => {
    expect.assertions(3)
    // git status --porcelain
    mockExecFileSync.mockReturnValueOnce('')
    // git fetch — fails
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('fetch failed')
    })
    // merge-base is skipped when fetchError is set

    const result = handleShipPreflight({ targetBranch: 'main' })
    const data = parseContent<PreflightSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.fetchError).toBe('fetch failed')
    expect(data.validation.valid).toBeTruthy()
  })

  it('passes correct args to git for status check', () => {
    expect.assertions(1)
    mockExecFileSync.mockReturnValueOnce('')
    mockExecFileSync.mockReturnValueOnce('')
    mockExecFileSync.mockReturnValueOnce('')

    handleShipPreflight({ targetBranch: 'main' })

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain'],
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })
})
