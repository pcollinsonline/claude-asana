import { execFileSync } from 'node:child_process'

import { checkGhAuth } from './_shared.js'
import {
  formatIssueBody,
  handleIssueCreateExecute,
  handleIssueCreatePrepare,
  handleIssueFetch,
  parseIssueRef,
} from './issue.js'

vi.mock('node:child_process')
vi.mock('./_shared.js', () => ({
  checkGhAuth: vi.fn(() => ({ authenticated: true, username: 'testuser' })),
}))

const mockExecFileSync = vi.mocked(execFileSync)
const mockCheckGhAuth = vi.mocked(checkGhAuth)

type ToolResult = ReturnType<typeof handleIssueFetch>

const parseContent = <T>(result: ToolResult): T =>
  JSON.parse(result.content.at(0)?.text ?? '{}') as T

interface FetchSuccessResponse {
  assignees: { login: string }[]
  body: string
  issueNumber: number
  labels: { name: string }[]
  state: string
  success: true
  title: string
  url: string
}

interface FetchErrorResponse {
  error: string
  issueNumber?: number
  success: false
}

// ---------------------------------------------------------------------------
// parseIssueRef
// ---------------------------------------------------------------------------

describe('parseIssueRef', () => {
  it('parses a GitHub URL', () => {
    expect.assertions(1)
    expect(parseIssueRef('https://github.com/owner/repo/issues/42')).toBe(42)
  })

  it('parses a URL with trailing path segments', () => {
    expect.assertions(1)
    expect(parseIssueRef('https://github.com/owner/repo/issues/99#issuecomment-123')).toBe(99)
  })

  it('parses #N shorthand', () => {
    expect.assertions(1)
    expect(parseIssueRef('#7')).toBe(7)
  })

  it('parses plain number', () => {
    expect.assertions(1)
    expect(parseIssueRef('55')).toBe(55)
  })

  it('trims whitespace', () => {
    expect.assertions(1)
    expect(parseIssueRef('  #12  ')).toBe(12)
  })

  it('returns null for non-matching input', () => {
    expect.assertions(1)
    expect(parseIssueRef('not-an-issue')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect.assertions(1)
    expect(parseIssueRef('')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// handleIssueFetch
// ---------------------------------------------------------------------------

describe('handleIssueFetch', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns structured issue data for a valid number', () => {
    expect.assertions(4)

    const issueData = {
      assignees: [{ login: 'user1' }],
      body: 'Issue body text',
      comments: [],
      labels: [{ name: 'bug' }],
      state: 'OPEN',
      title: 'Fix the widget',
      url: 'https://github.com/owner/repo/issues/42',
    }

    mockExecFileSync.mockReturnValueOnce(JSON.stringify(issueData))

    const result = handleIssueFetch({ issue: '42' })
    const data = parseContent<FetchSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.issueNumber).toBe(42)
    expect(data.title).toBe('Fix the widget')
    expect(result.isError).toBeUndefined()
  })

  it('accepts a GitHub URL', () => {
    expect.assertions(2)

    mockExecFileSync.mockReturnValueOnce(
      JSON.stringify({
        state: 'OPEN',
        title: 'Test issue',
        url: 'https://github.com/o/r/issues/7',
      }),
    )

    const result = handleIssueFetch({ issue: 'https://github.com/o/r/issues/7' })
    const data = parseContent<FetchSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.issueNumber).toBe(7)
  })

  it('accepts #N shorthand', () => {
    expect.assertions(2)

    mockExecFileSync.mockReturnValueOnce(
      JSON.stringify({ state: 'OPEN', title: 'Test', url: 'https://github.com/o/r/issues/55' }),
    )

    const result = handleIssueFetch({ issue: '#55' })
    const data = parseContent<FetchSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.issueNumber).toBe(55)
  })

  it('returns error for unparseable issue reference', () => {
    expect.assertions(3)

    const result = handleIssueFetch({ issue: 'not-a-number' })
    const data = parseContent<FetchErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.error).toContain('Could not parse issue reference')
    expect(result.isError).toBeTruthy()
  })

  it('returns error when gh command fails', () => {
    expect.assertions(3)

    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('issue not found')
    })

    const result = handleIssueFetch({ issue: '999' })
    const data = parseContent<FetchErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.issueNumber).toBe(999)
    expect(result.isError).toBeTruthy()
  })

  it('passes correct args to gh CLI', () => {
    expect.assertions(2)

    mockExecFileSync.mockReturnValueOnce(JSON.stringify({ state: 'OPEN', title: 'T' }))

    handleIssueFetch({ issue: '#14' })

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'view', '14', '--json', 'title,body,labels,assignees,comments,state,url'],
      expect.objectContaining({ encoding: 'utf8' }),
    )
    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
  })

  it('returns auth error when not authenticated', () => {
    expect.assertions(3)

    mockCheckGhAuth.mockReturnValueOnce({ authenticated: false, username: null })

    const result = handleIssueFetch({ issue: '42' })
    const data = parseContent<FetchErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.error).toContain('not authenticated')
    expect(result.isError).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// formatIssueBody
// ---------------------------------------------------------------------------

describe('formatIssueBody', () => {
  it('assembles four-section body with bot attribution', () => {
    expect.assertions(1)
    const result = formatIssueBody(
      'Add user management',
      'The app needs CRUD for users',
      '- Create endpoint\n- Add validation',
      '- [ ] POST /users returns 201',
    )

    expect(result).toBe(
      '## Purpose\nAdd user management\n\n## Context\nThe app needs CRUD for users\n\n## Requirements\n- Create endpoint\n- Add validation\n\n## Verification\n- [ ] POST /users returns 201\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)',
    )
  })

  it('handles multi-line sections', () => {
    expect.assertions(4)
    const result = formatIssueBody(
      'Line 1\nLine 2',
      'Context 1\nContext 2',
      '- Req 1\n- Req 2',
      '- [ ] V1\n- [ ] V2',
    )

    expect(result).toContain('Line 1\nLine 2')
    expect(result).toContain('Context 1\nContext 2')
    expect(result).toContain('- Req 1\n- Req 2')
    expect(result).toContain('- [ ] V1\n- [ ] V2')
  })
})

// ---------------------------------------------------------------------------
// handleIssueCreatePrepare
// ---------------------------------------------------------------------------

interface PrepareSuccessResponse {
  authenticated: boolean
  labels: string[]
  projects: { number: number; title: string }[]
  repo: string
  success: true
  username: string | null
}

interface PrepareErrorResponse {
  error: string
  success: false
}

describe('handleIssueCreatePrepare', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns structured result with all fields populated', () => {
    expect.assertions(5)
    mockCheckGhAuth.mockReturnValueOnce({ authenticated: true, username: 'user' })
    // gh api repos
    mockExecFileSync.mockReturnValueOnce('org/repo\n')
    // gh label list
    mockExecFileSync.mockReturnValueOnce('bug\nenhancement\ndocumentation\n')
    // gh project list
    mockExecFileSync.mockReturnValueOnce(JSON.stringify([{ number: 1, title: 'Backlog' }]))

    const result = handleIssueCreatePrepare()
    const data = parseContent<PrepareSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.repo).toBe('org/repo')
    expect(data.labels).toStrictEqual(['bug', 'enhancement', 'documentation'])
    expect(data.projects).toStrictEqual([{ number: 1, title: 'Backlog' }])
    expect(result.isError).toBeUndefined()
  })

  it('returns error when not authenticated', () => {
    expect.assertions(2)
    mockCheckGhAuth.mockReturnValueOnce({ authenticated: false, username: null })

    const result = handleIssueCreatePrepare()
    const data = parseContent<PrepareErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(result.isError).toBeTruthy()
  })

  it('returns error when repo cannot be determined', () => {
    expect.assertions(2)
    mockCheckGhAuth.mockReturnValueOnce({ authenticated: true, username: 'user' })
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('gh api failed')
    })

    const result = handleIssueCreatePrepare()
    const data = parseContent<PrepareErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(result.isError).toBeTruthy()
  })

  it('returns empty labels when gh label list fails', () => {
    expect.assertions(2)
    mockCheckGhAuth.mockReturnValueOnce({ authenticated: true, username: 'user' })
    mockExecFileSync.mockReturnValueOnce('org/repo\n')
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('gh label list failed')
    })
    mockExecFileSync.mockReturnValueOnce('[]')

    const result = handleIssueCreatePrepare()
    const data = parseContent<PrepareSuccessResponse>(result)

    expect(data.labels).toStrictEqual([])
    expect(data.success).toBeTruthy()
  })

  it('returns empty projects when gh project list fails', () => {
    expect.assertions(2)
    mockCheckGhAuth.mockReturnValueOnce({ authenticated: true, username: 'user' })
    mockExecFileSync.mockReturnValueOnce('org/repo\n')
    mockExecFileSync.mockReturnValueOnce('bug\n')
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('gh project list failed')
    })

    const result = handleIssueCreatePrepare()
    const data = parseContent<PrepareSuccessResponse>(result)

    expect(data.projects).toStrictEqual([])
    expect(data.success).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// handleIssueCreateExecute
// ---------------------------------------------------------------------------

interface ExecuteSuccessResponse {
  addedToProject: boolean
  success: true
  url: string
  warning?: string
}

interface ExecuteErrorResponse {
  error: string
  success: false
}

describe('handleIssueCreateExecute', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const baseArgs = {
    context: 'The app needs CRUD for users',
    purpose: 'Add user management',
    repo: 'org/repo',
    requirements: '- Create endpoint\n- Add validation',
    title: 'feat: add user management',
    verification: '- [ ] POST /users returns 201',
  }

  it('creates issue with body piped via stdin', () => {
    expect.assertions(3)
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/issues/42\n')

    const result = handleIssueCreateExecute(baseArgs)
    const data = parseContent<ExecuteSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.url).toBe('https://github.com/org/repo/issues/42')
    expect(result.isError).toBeUndefined()
  })

  it('passes correct args to gh CLI without optional fields', () => {
    expect.assertions(1)
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/issues/42\n')

    handleIssueCreateExecute(baseArgs)

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'create',
        '--repo',
        'org/repo',
        '--title',
        'feat: add user management',
        '--body-file',
        '-',
      ],
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('includes labels when provided', () => {
    expect.assertions(1)
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/issues/43\n')

    handleIssueCreateExecute({ ...baseArgs, labels: 'bug,urgent' })

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'create',
        '--repo',
        'org/repo',
        '--title',
        'feat: add user management',
        '--body-file',
        '-',
        '--label',
        'bug,urgent',
      ],
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('includes assignee when provided', () => {
    expect.assertions(1)
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/issues/44\n')

    handleIssueCreateExecute({ ...baseArgs, assignee: '@me' })

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'create',
        '--repo',
        'org/repo',
        '--title',
        'feat: add user management',
        '--body-file',
        '-',
        '--assignee',
        '@me',
      ],
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('adds issue to project when projectOwner and projectNumber provided', () => {
    expect.assertions(3)
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/issues/45\n')
    mockExecFileSync.mockReturnValueOnce('')

    const result = handleIssueCreateExecute({
      ...baseArgs,
      projectNumber: 5,
      projectOwner: 'org',
    })
    const data = parseContent<ExecuteSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.addedToProject).toBeTruthy()
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'gh',
      [
        'project',
        'item-add',
        '5',
        '--owner',
        'org',
        '--url',
        'https://github.com/org/repo/issues/45',
      ],
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('returns warning when project add fails but issue was created', () => {
    expect.assertions(3)
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/issues/46\n')
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('gh project item-add failed')
    })

    const result = handleIssueCreateExecute({
      ...baseArgs,
      projectNumber: 5,
      projectOwner: 'org',
    })
    const data = parseContent<ExecuteSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.url).toBe('https://github.com/org/repo/issues/46')
    expect(data.warning).toContain('failed to add to project')
  })

  it('returns error when gh issue create fails', () => {
    expect.assertions(2)
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('gh issue create failed')
    })

    const result = handleIssueCreateExecute(baseArgs)
    const data = parseContent<ExecuteErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(result.isError).toBeTruthy()
  })
})
