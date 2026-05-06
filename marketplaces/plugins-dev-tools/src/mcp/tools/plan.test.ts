import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { countTasks, getPlanPath, handlePlanRead, handlePlanWrite } from './plan.js'

vi.mock('node:fs')
vi.mock('node:child_process')

const MOCK_ROOT = '/mock/repo'

vi.mock('./_shared.js', () => ({
  _resetRepoRoot: vi.fn(),
  getCurrentBranch: vi.fn(() => 'feat/gh-42_test'),
  getRepoRoot: vi.fn(() => MOCK_ROOT),
}))

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)
const mockMkdirSync = vi.mocked(mkdirSync)

type ToolResult = ReturnType<typeof handlePlanRead>

const parseContent = <T>(result: ToolResult): T =>
  JSON.parse(result.content.at(0)?.text ?? '{}') as T

interface PlanReadResponse {
  branch: string | null
  completedTasks: number
  content: string | null
  exists: boolean
  status: string | null
  totalTasks: number
}

interface PlanWriteResponse {
  error?: string
  path?: string
  success: boolean
}

// ---------------------------------------------------------------------------
// getPlanPath
// ---------------------------------------------------------------------------

describe('getPlanPath', () => {
  it('returns correct path for issue number', () => {
    expect.assertions(1)
    expect(getPlanPath('/repo', 42)).toBe('/repo/.ai/plugins-dev-tools/plans/gh-42.md')
  })
})

// ---------------------------------------------------------------------------
// countTasks
// ---------------------------------------------------------------------------

describe('countTasks', () => {
  it('counts completed and total tasks', () => {
    expect.assertions(2)
    const content = [
      '- [x] 1. Create schema',
      '- [ ] 2. Add route',
      '- [x] 3. Add tests',
      '- [ ] 4. Update docs',
    ].join('\n')

    const { completedTasks, totalTasks } = countTasks(content)
    expect(totalTasks).toBe(4)
    expect(completedTasks).toBe(2)
  })

  it('returns zeros for content without checkboxes', () => {
    expect.assertions(2)
    const { completedTasks, totalTasks } = countTasks('No tasks here')
    expect(totalTasks).toBe(0)
    expect(completedTasks).toBe(0)
  })

  it('handles indented checkboxes', () => {
    expect.assertions(2)
    const content = '  - [x] Indented done\n\t- [ ] Tab indented'
    const { completedTasks, totalTasks } = countTasks(content)
    expect(totalTasks).toBe(2)
    expect(completedTasks).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// handlePlanRead
// ---------------------------------------------------------------------------

describe('handlePlanRead', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns exists: false when plan file does not exist', () => {
    expect.assertions(3)

    mockExistsSync.mockReturnValueOnce(false)

    const result = handlePlanRead({ issue: 99 })
    const data = parseContent<PlanReadResponse>(result)

    expect(data.exists).toBeFalsy()
    expect(data.totalTasks).toBe(0)
    expect(data.content).toBeNull()
  })

  it('reads and parses an existing plan file', () => {
    expect.assertions(6)

    const planContent = [
      '---',
      'issue: 42',
      'branch: feat/gh-42-widget',
      'status: implementing',
      '---',
      '',
      '## Tasks',
      '- [x] 1. Create schema',
      '- [ ] 2. Add route',
      '- [ ] 3. Add tests',
    ].join('\n')

    mockExistsSync.mockReturnValueOnce(true)
    mockReadFileSync.mockReturnValueOnce(planContent)

    const result = handlePlanRead({ issue: 42 })
    const data = parseContent<PlanReadResponse>(result)

    expect(data.exists).toBeTruthy()
    expect(data.status).toBe('implementing')
    expect(data.branch).toBe('feat/gh-42-widget')
    expect(data.totalTasks).toBe(3)
    expect(data.completedTasks).toBe(1)
    expect(data.content).toBe(planContent)
  })

  it('reads correct file path', () => {
    expect.assertions(1)

    mockExistsSync.mockReturnValueOnce(false)

    handlePlanRead({ issue: 55 })

    expect(mockExistsSync).toHaveBeenCalledWith(`${MOCK_ROOT}/.ai/plugins-dev-tools/plans/gh-55.md`)
  })
})

// ---------------------------------------------------------------------------
// handlePlanWrite
// ---------------------------------------------------------------------------

describe('handlePlanWrite', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('writes a valid plan file', () => {
    expect.assertions(3)

    const content = [
      '---',
      'issue: 42',
      'status: planning',
      'branch: feat/gh-42-widget',
      '---',
      '',
      '## Summary',
      'Plan content here.',
    ].join('\n')

    const result = handlePlanWrite({ content, issue: 42 })
    const data = parseContent<PlanWriteResponse>(result)

    expect(data.success).toBeTruthy()
    expect(mockMkdirSync).toHaveBeenCalledWith(`${MOCK_ROOT}/.ai/plugins-dev-tools/plans`, {
      recursive: true,
    })
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${MOCK_ROOT}/.ai/plugins-dev-tools/plans/gh-42.md`,
      content,
      'utf8',
    )
  })

  it('rejects content missing required frontmatter fields', () => {
    expect.assertions(3)

    const content = ['---', 'status: planning', '---', '', 'Missing issue field.'].join('\n')

    const result = handlePlanWrite({ content, issue: 42 })
    const data = parseContent<PlanWriteResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.error).toContain('issue')
    expect(result.isError).toBeTruthy()
  })

  it('rejects content with no frontmatter', () => {
    expect.assertions(2)

    const result = handlePlanWrite({ content: 'No frontmatter here', issue: 42 })
    const data = parseContent<PlanWriteResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.error).toContain('issue')
  })

  it('rejects invalid status value', () => {
    expect.assertions(2)

    const content = ['---', 'issue: 42', 'status: invalid-status', '---', '', 'Body.'].join('\n')

    const result = handlePlanWrite({ content, issue: 42 })
    const data = parseContent<PlanWriteResponse>(result)

    expect(data.success).toBeFalsy()
    expect(data.error).toContain('Invalid status')
  })

  it('accepts all valid status values', () => {
    expect.assertions(4)

    for (const status of ['planning', 'implementing', 'shipping', 'complete']) {
      vi.clearAllMocks()
      const content = [`---`, `issue: 42`, `status: ${status}`, `---`, '', 'Body.'].join('\n')

      const result = handlePlanWrite({ content, issue: 42 })
      const data = parseContent<PlanWriteResponse>(result)

      expect(data.success).toBeTruthy()
    }
  })
})
