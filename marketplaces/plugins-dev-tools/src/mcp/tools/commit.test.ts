import { execFileSync, execSync } from 'node:child_process'

import { commit as mockCommitFn } from '../../skills/commit/commit.js'

import {
  type FileStatus,
  _resetRepoRoot,
  applyScope,
  groupByWorkspace,
  handleCommitDiff,
  handleCommitExecute,
  handleCommitPrepare,
  inferScope,
  validateHeader,
} from './commit.js'

vi.mock('node:child_process')
vi.mock('../../skills/commit/commit.js', () => ({
  assembleMessage: vi.fn((header: string, body?: string, coAuthor?: string) => {
    const parts = [header]
    if (body) parts.push(body)
    if (coAuthor) parts.push(`Co-Authored-By: ${coAuthor} <noreply@anthropic.com>`)
    return parts.join('\n\n')
  }),
  commit: vi.fn(),
  normalizeHeader: vi.fn((msg: string) => {
    const idx = msg.indexOf('\n')
    if (idx === -1) return msg.toLowerCase()
    return msg.slice(0, idx).toLowerCase() + msg.slice(idx)
  }),
}))

const mockExecSync = vi.mocked(execSync)
const mockExecFileSync = vi.mocked(execFileSync)
const mockCommit = vi.mocked(mockCommitFn)

const MOCK_ROOT = '/repo'
const MOCK_BRANCH = 'main'

// ---------------------------------------------------------------------------
// Response shapes (mirrors what the handlers serialize to JSON)
// ---------------------------------------------------------------------------

interface PrepareResponse {
  branch: string
  config: { allowedTypes: string[]; headerMaxLength: number; workspaceDirs: string[] }
  files: FileStatus[]
  filesByWorkspace: Record<string, FileStatus[]>
  inferredScope: string | null
  recentCommits: string[]
  repoRoot: string
  warnings: string[]
}

interface ExecuteErrorResponse {
  errors: string[]
  isError: true
  stage: 'commit' | 'staging' | 'validation'
  success: false
}

interface ExecuteSuccessResponse {
  branch: string
  commitHash: string
  commitHashShort: string
  commitMessage: string
  remainingChanges: number
  success: true
}

type ToolResult = ReturnType<typeof handleCommitPrepare>

const parseContent = <T>(result: ToolResult): T =>
  JSON.parse(result.content.at(0)?.text ?? '{}') as T

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateHeader', () => {
  it('accepts a valid conventional commit header', () => {
    expect.assertions(2)
    const result = validateHeader('feat(api): add user endpoint')
    expect(result.valid).toBeTruthy()
    expect(result.errors).toHaveLength(0)
  })

  it.each([
    'ai',
    'build',
    'chore',
    'ci',
    'docs',
    'feat',
    'fix',
    'perf',
    'refactor',
    'revert',
    'style',
    'test',
  ])('accepts type %s', (type) => {
    expect.assertions(1)
    expect(validateHeader(`${type}: do something`).valid).toBeTruthy()
  })

  it('rejects an unknown type', () => {
    expect.assertions(2)
    const result = validateHeader('invalid: do something')
    expect(result.valid).toBeFalsy()
    expect(result.errors[0]).toMatch(/Invalid type "invalid"/)
  })

  it('rejects a header that exceeds max length', () => {
    expect.assertions(2)
    const longSubject = 'a'.repeat(95)
    const result = validateHeader(`feat: ${longSubject}`)
    expect(result.valid).toBeFalsy()
    expect(result.errors[0]).toMatch(/exceeds max length of 100/)
  })

  it('rejects a non-lowercase subject', () => {
    expect.assertions(2)
    const result = validateHeader('feat(api): Add API endpoint')
    expect(result.valid).toBeFalsy()
    expect(result.errors[0]).toMatch(/fully lowercase/)
  })

  it('rejects a subject with a trailing period', () => {
    expect.assertions(2)
    const result = validateHeader('fix(db): resolve connection leak.')
    expect(result.valid).toBeFalsy()
    expect(result.errors[0]).toMatch(/must not end with a period/)
  })

  it('rejects a header that does not match conventional commits format', () => {
    expect.assertions(2)
    const result = validateHeader('not a valid header at all')
    expect(result.valid).toBeFalsy()
    expect(result.errors[0]).toMatch(/conventional commits format/)
  })

  it('collects multiple errors', () => {
    expect.assertions(2)
    const result = validateHeader('invalid: Not Lowercase.')
    expect(result.valid).toBeFalsy()
    // invalid type + non-lowercase + trailing period
    expect(result.errors.length).toBeGreaterThanOrEqual(2)
  })
})

describe('applyScope', () => {
  const files: FileStatus[] = [
    {
      diffStat: '+5 -2',
      path: 'packages/core/src/index.ts',
      staged: true,
      status: 'staged:modified',
      workspaceDir: 'packages/core',
    },
    {
      diffStat: '+3 -1',
      path: 'packages/utils/src/helper.ts',
      staged: false,
      status: 'unstaged:modified',
      workspaceDir: 'packages/utils',
    },
    {
      diffStat: '+10 -0',
      path: 'apps/web/src/app.ts',
      staged: true,
      status: 'staged:added',
      workspaceDir: 'apps/web',
    },
    {
      diffStat: '+1 -1',
      path: 'CLAUDE.md',
      staged: false,
      status: 'unstaged:modified',
      workspaceDir: null,
    },
  ]

  it('returns all files when no scope provided', () => {
    expect.assertions(1)
    const warnings: string[] = []
    expect(applyScope(files, undefined, warnings)).toHaveLength(4)
  })

  it('filters by directory prefix', () => {
    expect.assertions(2)
    const warnings: string[] = []
    const result = applyScope(files, 'packages', warnings)
    expect(result).toHaveLength(2)
    expect(result.every((f) => f.path.startsWith('packages/'))).toBeTruthy()
  })

  it('filters by comma-separated file list', () => {
    expect.assertions(2)
    const warnings: string[] = []
    const result = applyScope(files, 'packages/core/src/index.ts, apps/web/src/app.ts', warnings)
    expect(result).toHaveLength(2)
    expect(result.map((f) => f.path)).toStrictEqual([
      'packages/core/src/index.ts',
      'apps/web/src/app.ts',
    ])
  })

  it('adds a warning for named files with no changes', () => {
    expect.assertions(2)
    const warnings: string[] = []
    applyScope(files, 'packages/core/src/index.ts, nonexistent/file.ts', warnings)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/nonexistent\/file\.ts/)
  })

  it('handles trailing slash on directory scope', () => {
    expect.assertions(1)
    const warnings: string[] = []
    const result = applyScope(files, 'packages/', warnings)
    expect(result).toHaveLength(2)
  })
})

describe('groupByWorkspace', () => {
  it('returns empty object for empty array', () => {
    expect.assertions(1)
    expect(groupByWorkspace([])).toStrictEqual({})
  })

  it('groups root files under "(root)"', () => {
    expect.assertions(2)
    const files: FileStatus[] = [
      {
        diffStat: '+1 -1',
        path: 'CLAUDE.md',
        staged: false,
        status: 'unstaged:modified',
        workspaceDir: null,
      },
    ]
    const result = groupByWorkspace(files)
    expect(Object.keys(result)).toStrictEqual(['(root)'])
    expect(result['(root)']).toHaveLength(1)
  })

  it('groups files by workspace directory', () => {
    expect.assertions(3)
    const files: FileStatus[] = [
      {
        diffStat: '+5 -2',
        path: 'packages/core/src/index.ts',
        staged: true,
        status: 'staged:modified',
        workspaceDir: 'packages/core',
      },
      {
        diffStat: '+3 -1',
        path: 'packages/utils/src/helper.ts',
        staged: false,
        status: 'unstaged:modified',
        workspaceDir: 'packages/utils',
      },
    ]
    const result = groupByWorkspace(files)
    expect(Object.keys(result)).toStrictEqual(['packages/core', 'packages/utils'])
    expect(result['packages/core']).toHaveLength(1)
    expect(result['packages/utils']).toHaveLength(1)
  })

  it('sorts keys alphabetically with "(root)" last', () => {
    expect.assertions(1)
    const files: FileStatus[] = [
      {
        diffStat: '+1 -1',
        path: 'CLAUDE.md',
        staged: false,
        status: 'unstaged:modified',
        workspaceDir: null,
      },
      {
        diffStat: '+10 -0',
        path: 'apps/web/src/app.ts',
        staged: true,
        status: 'staged:added',
        workspaceDir: 'apps/web',
      },
      {
        diffStat: '+5 -2',
        path: 'packages/core/src/index.ts',
        staged: true,
        status: 'staged:modified',
        workspaceDir: 'packages/core',
      },
    ]
    expect(Object.keys(groupByWorkspace(files))).toStrictEqual([
      'apps/web',
      'packages/core',
      '(root)',
    ])
  })
})

const makeFile = (workspaceDir: string | null): FileStatus => ({
  diffStat: '+1 -0',
  path: `${workspaceDir ?? ''}/file.ts`,
  staged: false,
  status: 'unstaged:modified',
  workspaceDir,
})

describe('inferScope', () => {
  it('returns null for empty files', () => {
    expect.assertions(1)
    expect(inferScope([])).toBeNull()
  })

  it('returns null for root-only files', () => {
    expect.assertions(1)
    expect(inferScope([makeFile(null)])).toBeNull()
  })

  it('returns the workspace dir for a single workspace', () => {
    expect.assertions(1)
    expect(inferScope([makeFile('packages/core'), makeFile('packages/core')])).toBe('packages/core')
  })

  it('returns "monorepo" for cross-cutting changes', () => {
    expect.assertions(1)
    expect(inferScope([makeFile('packages/core'), makeFile('apps/web')])).toBe('monorepo')
  })

  it('returns null for multiple workspaces under same top-level (llm decides)', () => {
    expect.assertions(1)
    expect(inferScope([makeFile('packages/core'), makeFile('packages/utils')])).toBeNull()
  })

  it('returns null when root files are mixed with workspace files (llm decides)', () => {
    expect.assertions(1)
    expect(inferScope([makeFile(null), makeFile('packages/core')])).toBeNull()
  })
})

describe('handleCommitPrepare', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetRepoRoot()
  })

  it('returns structured json with files, grouping, scope, and config (no diff)', () => {
    expect.assertions(10)

    mockExecSync
      .mockReturnValueOnce(`${MOCK_ROOT}\n`) // git rev-parse --show-toplevel
      .mockReturnValueOnce(`${MOCK_BRANCH}\n`) // git rev-parse --abbrev-ref HEAD
      .mockReturnValueOnce(' M packages/core/src/index.ts\n') // git status --porcelain=v1
      .mockReturnValueOnce('abc1234 feat: add core\n') // git log --oneline -10

    mockExecFileSync.mockReturnValueOnce('5\t2\tpackages/core/src/index.ts\n') // git diff HEAD --numstat

    const result = handleCommitPrepare({ scope: undefined })
    const data = parseContent<PrepareResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.repoRoot).toBe(MOCK_ROOT)
    expect(data.branch).toBe(MOCK_BRANCH)
    expect(data.files).toHaveLength(1)
    expect(data.files.at(0)?.path).toBe('packages/core/src/index.ts')
    expect(data.files.at(0)?.diffStat).toBe('+5 -2')
    expect(data.recentCommits).toHaveLength(1)
    expect(data.config.allowedTypes).toContain('feat')
    expect(data.filesByWorkspace).toStrictEqual({ 'packages/core': data.files })
    expect(data.inferredScope).toBe('packages/core')
  })

  it('returns an error response when git commands fail', () => {
    expect.assertions(1)
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo')
    })

    const result = handleCommitPrepare({ scope: undefined })
    expect(result.isError).toBeTruthy()
  })

  it('applies scope filtering', () => {
    expect.assertions(1)

    mockExecSync
      .mockReturnValueOnce(`${MOCK_ROOT}\n`)
      .mockReturnValueOnce(`${MOCK_BRANCH}\n`)
      .mockReturnValueOnce(' M packages/core/src/index.ts\n M apps/web/src/app.ts\n')
      .mockReturnValueOnce('abc1234 feat: add core\n')

    mockExecFileSync.mockReturnValueOnce('3\t1\tpackages/core/src/index.ts\n') // git diff HEAD --numstat

    const result = handleCommitPrepare({ scope: 'packages' })
    const data = parseContent<PrepareResponse>(result)
    expect(data.files.every((f) => f.path.startsWith('packages/'))).toBeTruthy()
  })

  it('includes diffStat for lock files without embedding diff', () => {
    expect.assertions(3)

    mockExecSync
      .mockReturnValueOnce(`${MOCK_ROOT}\n`)
      .mockReturnValueOnce(`${MOCK_BRANCH}\n`)
      .mockReturnValueOnce(' M packages/core/src/index.ts\n M pnpm-lock.yaml\n')
      .mockReturnValueOnce('abc1234 feat: add core\n')

    mockExecFileSync.mockReturnValueOnce(
      '5\t2\tpackages/core/src/index.ts\n489\t1\tpnpm-lock.yaml\n',
    ) // --numstat

    const result = handleCommitPrepare({ scope: undefined })
    const data = parseContent<PrepareResponse>(result)

    const lockFile = data.files.find((f) => f.path === 'pnpm-lock.yaml')
    expect(lockFile).toBeDefined()
    expect(lockFile?.diffStat).toBe('+489 -1')
    // Response should not contain a 'diff' field at all
    expect(Object.keys(data)).not.toContain('diff')
  })
})

describe('handleCommitDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetRepoRoot()
  })

  it('returns unified diff for all files when no files specified', () => {
    expect.assertions(2)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`) // getRepoRoot
    mockExecFileSync.mockReturnValueOnce('diff --git a/src/index.ts ...\n+hello\n')

    const result = handleCommitDiff({ files: undefined })

    expect(result.isError).toBeUndefined()
    expect(result.content.at(0)?.text).toContain('diff --git')
  })

  it('returns scoped diff when specific files are provided', () => {
    expect.assertions(1)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync.mockReturnValueOnce('diff --git a/src/foo.ts ...\n')

    handleCommitDiff({ files: ['src/foo.ts'] })

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['--', 'src/foo.ts']),
      expect.any(Object),
    )
  })

  it('excludes lock files from diff output', () => {
    expect.assertions(1)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync.mockReturnValueOnce('')

    handleCommitDiff({ files: undefined })

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining([
        ':!pnpm-lock.yaml',
        ':!package-lock.json',
        ':!yarn.lock',
        ':!bun.lock',
      ]),
      expect.any(Object),
    )
  })

  it('returns "(no changes)" when diff is empty', () => {
    expect.assertions(1)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync.mockReturnValueOnce('')

    const result = handleCommitDiff({ files: undefined })
    expect(result.content.at(0)?.text).toBe('(no changes)')
  })

  it('returns error when git fails', () => {
    expect.assertions(1)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync.mockImplementation(() => {
      throw new Error('git diff failed')
    })

    const result = handleCommitDiff({ files: undefined })
    expect(result.isError).toBeTruthy()
  })
})

describe('handleCommitExecute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetRepoRoot()
  })

  it('returns validation error for paths outside repo root', () => {
    expect.assertions(3)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)

    const result = handleCommitExecute({
      body: undefined,
      coAuthor: undefined,
      files: ['/outside/repo/file.ts'],
      header: 'feat: add feature',
    })
    const data = parseContent<ExecuteErrorResponse>(result)

    expect(result.isError).toBeTruthy()
    expect(data.stage).toBe('validation')
    expect(data.errors.at(0)).toMatch(/outside repo root/)
  })

  it('returns validation error for invalid header and does not run git', () => {
    expect.assertions(4)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)

    const result = handleCommitExecute({
      body: undefined,
      coAuthor: undefined,
      files: [`${MOCK_ROOT}/packages/core/src/index.ts`],
      header: 'invalid: Not Lowercase Header.',
    })
    const data = parseContent<ExecuteErrorResponse>(result)

    expect(result.isError).toBeTruthy()
    expect(data.stage).toBe('validation')
    expect(mockExecFileSync).not.toHaveBeenCalled()
    expect(data.errors.length).toBeGreaterThan(0)
  })

  it('returns staging error when git add fails', () => {
    expect.assertions(2)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync.mockImplementation(() => {
      throw new Error('pathspec did not match any files')
    })

    const result = handleCommitExecute({
      body: undefined,
      coAuthor: undefined,
      files: [`${MOCK_ROOT}/packages/core/src/index.ts`],
      header: 'feat(packages): add feature',
    })
    const data = parseContent<ExecuteErrorResponse>(result)

    expect(result.isError).toBeTruthy()
    expect(data.stage).toBe('staging')
  })

  it('returns commit error when git commit fails', () => {
    expect.assertions(2)

    mockCommit.mockImplementationOnce(() => {
      throw new Error('pre-commit hook failed')
    })

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync.mockReturnValueOnce('') // git add succeeds

    const result = handleCommitExecute({
      body: undefined,
      coAuthor: undefined,
      files: [`${MOCK_ROOT}/packages/core/src/index.ts`],
      header: 'feat(packages): add feature',
    })
    const data = parseContent<ExecuteErrorResponse>(result)

    expect(result.isError).toBeTruthy()
    expect(data.stage).toBe('commit')
  })

  it('returns success response with commit hash and remaining changes', () => {
    expect.assertions(6)

    mockExecSync
      .mockReturnValueOnce(`${MOCK_ROOT}\n`) // getRepoRoot
      .mockReturnValueOnce('abc1234567890\nabc1234\n') // git log -1 --format=%H%n%h
      .mockReturnValueOnce(`${MOCK_BRANCH}\n`) // getCurrentBranch
      .mockReturnValueOnce('') // git status --porcelain=v1 (no remaining changes)

    mockExecFileSync.mockReturnValueOnce('') // git add

    const result = handleCommitExecute({
      body: undefined,
      coAuthor: 'Claude Sonnet 4.6',
      files: [`${MOCK_ROOT}/packages/core/src/index.ts`],
      header: 'feat(packages/core): add index module',
    })
    const data = parseContent<ExecuteSuccessResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.success).toBeTruthy()
    expect(data.commitHash).toBe('abc1234567890')
    expect(data.commitHashShort).toBe('abc1234')
    expect(data.branch).toBe(MOCK_BRANCH)
    expect(data.remainingChanges).toBe(0)
  })
})
