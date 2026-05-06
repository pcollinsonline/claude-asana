import { execFileSync } from 'node:child_process'

import { extractIssueNumber, handlePrCreate, handlePrPrepare, renderTemplate } from './pr.js'

vi.mock('node:child_process')

const MOCK_ROOT = '/mock/repo'
const MOCK_BRANCH = 'feat/gh-42_add-widget'

vi.mock('./_shared.js', () => ({
  _resetRepoRoot: vi.fn(),
  extractIssueNumber: (branchName: string): number | null => {
    const match = /\/gh-(\d+)/.exec(branchName)
    return match ? Number(match[1]) : null
  },
  getCurrentBranch: vi.fn(() => MOCK_BRANCH),
  getRepoRoot: vi.fn(() => MOCK_ROOT),
}))

const mockExecFileSync = vi.mocked(execFileSync)

type ToolResult = ReturnType<typeof handlePrPrepare>

const parseContent = <T>(result: ToolResult): T =>
  JSON.parse(result.content.at(0)?.text ?? '{}') as T

interface PrepareResponse {
  branch: string
  commits: string[]
  diffStat: string
  existingPrUrl: string | null
  filesChanged: number
  issueNumber: number | null
  targetBranch: string
  validation: { error?: string; valid: boolean }
}

interface CreateSuccessResponse {
  action: 'created' | 'updated'
  success: true
  url: string
}

interface CreateErrorResponse {
  errors: string[]
  isError: true
  stage: string
  success: false
}

// ---------------------------------------------------------------------------
// extractIssueNumber
// ---------------------------------------------------------------------------

describe('extractIssueNumber', () => {
  it('extracts issue number from feat/gh-N branch', () => {
    expect.assertions(1)
    expect(extractIssueNumber('feat/gh-14_auto-close')).toBe(14)
  })

  it('extracts issue number from fix/gh-N branch', () => {
    expect.assertions(1)
    expect(extractIssueNumber('fix/gh-123_some-thing')).toBe(123)
  })

  it('returns null for branches without gh- pattern', () => {
    expect.assertions(1)
    expect(extractIssueNumber('main')).toBeNull()
  })

  it('returns null when gh has no hyphen', () => {
    expect.assertions(1)
    expect(extractIssueNumber('feature/gh14-stuff')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

describe('renderTemplate', () => {
  it('replaces simple placeholders', () => {
    expect.assertions(1)
    const result = renderTemplate('Hello {{name}}', { name: 'world' })
    expect(result).toBe('Hello world')
  })

  it('replaces multiple placeholders in a template', () => {
    expect.assertions(2)
    const result = renderTemplate('## Summary\n{{summary}}\n\n## Test plan\n{{testPlan}}', {
      summary: '- Add widget',
      testPlan: '- [ ] Test widget',
    })
    expect(result).toContain('- Add widget')
    expect(result).toContain('- [ ] Test widget')
  })

  it('replaces null values with empty string', () => {
    expect.assertions(1)
    const result = renderTemplate('Value: {{missing}}', { missing: null })
    expect(result).toBe('Value: ')
  })
})

// ---------------------------------------------------------------------------
// handlePrPrepare
// ---------------------------------------------------------------------------

describe('handlePrPrepare', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns branch info, commits, diffStat, and validation', () => {
    expect.assertions(7)

    mockExecFileSync
      .mockReturnValueOnce('abc1234 feat: add widget\ndef5678 fix: typo\n') // git log
      .mockReturnValueOnce(
        ' src/widget.ts | 10 +++++++---\n 1 file changed, 7 insertions(+), 3 deletions(-)\n',
      ) // git diff --stat

    // gh pr view (no existing PR)
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('no pull requests found')
    })

    const result = handlePrPrepare({ targetBranch: 'main' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.branch).toBe(MOCK_BRANCH)
    expect(data.targetBranch).toBe('main')
    expect(data.commits).toHaveLength(2)
    expect(data.issueNumber).toBe(42)
    expect(data.validation.valid).toBeTruthy()
    expect(data.filesChanged).toBe(1)
    expect(data.existingPrUrl).toBeNull()
  })

  it('defaults targetBranch to main', () => {
    expect.assertions(1)

    mockExecFileSync.mockReturnValueOnce('abc1234 feat: add widget\n')
    mockExecFileSync.mockReturnValueOnce(' src/widget.ts | 5 +++++\n 1 file changed\n')
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('no pull requests found')
    })

    const result = handlePrPrepare({ targetBranch: undefined })
    const data = parseContent<PrepareResponse>(result)

    expect(data.targetBranch).toBe('main')
  })

  it('detects existing PR URL', () => {
    expect.assertions(1)

    mockExecFileSync.mockReturnValueOnce('abc1234 feat: add widget\n')
    mockExecFileSync.mockReturnValueOnce(' src/widget.ts | 5 +++++\n 1 file changed\n')
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/pull/5\n')

    const result = handlePrPrepare({ targetBranch: 'main' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.existingPrUrl).toBe('https://github.com/org/repo/pull/5')
  })

  it('returns validation error when no commits ahead', () => {
    expect.assertions(2)

    mockExecFileSync.mockReturnValueOnce('')

    const result = handlePrPrepare({ targetBranch: 'main' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.validation.valid).toBeFalsy()
    expect(data.validation.error).toContain('No commits')
  })

  it('returns validation error when on main branch', async () => {
    expect.assertions(2)

    const { getCurrentBranch } = await import('./_shared.js')
    vi.mocked(getCurrentBranch).mockReturnValueOnce('main')

    const result = handlePrPrepare({ targetBranch: 'develop' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.validation.valid).toBeFalsy()
    expect(data.validation.error).toContain('Cannot create PR from the main branch')
  })
})

// ---------------------------------------------------------------------------
// handlePrCreate
// ---------------------------------------------------------------------------

describe('handlePrCreate', () => {
  const defaultTemplate = [
    '## Summary',
    '{{summary}}',
    '',
    '## Test plan',
    '{{testPlan}}',
    '',
    'bot line',
  ].join('\n')

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new PR when none exists', () => {
    expect.assertions(3)

    // checkExistingPr — no PR
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('no pull requests found')
    })
    // gh pr create
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/pull/1\n')

    const result = handlePrCreate({
      base: 'main',
      summary: '- Add widget',
      template: defaultTemplate,
      testPlan: '- [ ] Test widget',
      title: 'feat(widget): add widget component',
    })
    const data = parseContent<CreateSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.action).toBe('created')
    expect(data.url).toBe('https://github.com/org/repo/pull/1')
  })

  it('updates existing PR when one exists', () => {
    expect.assertions(3)

    // checkExistingPr — PR exists
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/pull/5\n')
    // gh pr edit
    mockExecFileSync.mockReturnValueOnce('')

    const result = handlePrCreate({
      base: 'main',
      summary: '- Updated changes',
      template: defaultTemplate,
      testPlan: '- [ ] Verify',
      title: 'feat(widget): updated widget',
    })
    const data = parseContent<CreateSuccessResponse>(result)

    expect(data.success).toBeTruthy()
    expect(data.action).toBe('updated')
    expect(data.url).toBe('https://github.com/org/repo/pull/5')
  })

  it('populates template with closesIssue from branch name', () => {
    expect.assertions(1)

    // checkExistingPr — no PR
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('no pull requests found')
    })
    // gh pr create
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/pull/2\n')

    handlePrCreate({
      base: 'main',
      summary: '- Add widget',
      template: defaultTemplate,
      testPlan: '- [ ] Test',
      title: 'feat: add widget',
    })

    // Verify the body passed to gh pr create contains Closes #42
    const createCall = mockExecFileSync.mock.calls.at(1)
    const options = createCall?.at(2) as undefined | { input?: string }
    expect(options?.input).toContain('Closes #42')
  })

  it('returns error when gh command fails', () => {
    expect.assertions(3)

    // checkExistingPr — no PR
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('no pull requests found')
    })
    // gh pr create — fails
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('gh pr create failed')
    })

    const result = handlePrCreate({
      base: 'main',
      summary: '- Changes',
      template: defaultTemplate,
      testPlan: '- [ ] Test',
      title: 'feat: test',
    })
    const data = parseContent<CreateErrorResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.errors.at(0)).toContain('gh pr create failed')
    expect(result.isError).toBeTruthy()
  })

  it('omits Closes line when no issue number in branch', async () => {
    expect.assertions(1)

    const { getCurrentBranch } = await import('./_shared.js')
    vi.mocked(getCurrentBranch).mockReturnValueOnce('feat/add-widget')

    // checkExistingPr — no PR
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('no pull requests found')
    })
    // gh pr create
    mockExecFileSync.mockReturnValueOnce('https://github.com/org/repo/pull/3\n')

    handlePrCreate({
      base: 'main',
      summary: '- Add widget',
      template: defaultTemplate,
      testPlan: '- [ ] Test',
      title: 'feat: add widget',
    })

    const createCall = mockExecFileSync.mock.calls.at(1)
    const options = createCall?.at(2) as undefined | { input?: string }
    expect(options?.input).not.toContain('Closes')
  })
})
