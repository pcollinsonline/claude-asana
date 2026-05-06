import { execFileSync, execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import {
  _resetRepoRoot,
  classifyFile,
  handlePluginsDocPrepare,
  handlePluginsDocUpdate,
} from './plugins-doc.js'

vi.mock('node:child_process')
vi.mock('node:fs')

const mockExecSync = vi.mocked(execSync)
const mockExecFileSync = vi.mocked(execFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)

const MOCK_ROOT = '/repo'

type ToolResult = ReturnType<typeof handlePluginsDocPrepare>

const parseContent = <T>(result: ToolResult): T =>
  JSON.parse(result.content.at(0)?.text ?? '{}') as T

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface PrepareResponse {
  changedFiles: {
    entityName: string | null
    fileType: string
    path: string
    pluginName: string | null
    status: string
  }[]
  docLastCommit: string | null
  docLastDate: string | null
  repoRoot: string
  sourceLastDate: string | null
  status: string
}

interface UpdateResponse {
  error?: string
  filePath?: string
  success: boolean
}

// ---------------------------------------------------------------------------
// classifyFile
// ---------------------------------------------------------------------------

describe('classifyFile', () => {
  it('classifies a skill SKILL.md', () => {
    expect.assertions(3)
    const result = classifyFile('marketplaces/plugins-dev-tools/skills/commit/SKILL.md')
    expect(result.fileType).toBe('skill')
    expect(result.pluginName).toBe('plugins-dev-tools')
    expect(result.entityName).toBe('commit')
  })

  it('classifies an agent definition', () => {
    expect.assertions(3)
    const result = classifyFile('marketplaces/plugins-dev-tools/agents/commit-agent.md')
    expect(result.fileType).toBe('agent')
    expect(result.pluginName).toBe('plugins-dev-tools')
    expect(result.entityName).toBe('commit-agent')
  })

  it('classifies a hook entry point', () => {
    expect.assertions(3)
    const result = classifyFile('marketplaces/plugins-dev-tools/src/hooks/pre-tool-use/index.ts')
    expect(result.fileType).toBe('hook')
    expect(result.pluginName).toBe('plugins-dev-tools')
    expect(result.entityName).toBe('pre-tool-use')
  })

  it('classifies an MCP tool file', () => {
    expect.assertions(2)
    const result = classifyFile('marketplaces/plugins-dev-tools/src/mcp/tools/commit.ts')
    expect(result.fileType).toBe('mcp-tool')
    expect(result.pluginName).toBe('plugins-dev-tools')
  })

  it('excludes test files from mcp-tool classification', () => {
    expect.assertions(1)
    const result = classifyFile('marketplaces/plugins-dev-tools/src/mcp/tools/commit.test.ts')
    expect(result.fileType).toBe('other')
  })

  it('classifies a build script', () => {
    expect.assertions(2)
    const result = classifyFile('marketplaces/plugins-dev-tools/src/build.ts')
    expect(result.fileType).toBe('build')
    expect(result.pluginName).toBe('plugins-dev-tools')
  })

  it('classifies a package.json', () => {
    expect.assertions(2)
    const result = classifyFile('marketplaces/plugins-dev-tools/package.json')
    expect(result.fileType).toBe('package-json')
    expect(result.pluginName).toBe('plugins-dev-tools')
  })

  it('classifies marketplace.json', () => {
    expect.assertions(1)
    const result = classifyFile('marketplaces/monorepo-marketplace/.claude-plugin/marketplace.json')
    expect(result.fileType).toBe('marketplace-json')
  })

  it('classifies plugins-base files', () => {
    expect.assertions(1)
    const result = classifyFile('packages/plugins-base/src/index.ts')
    expect(result.fileType).toBe('plugins-base')
  })

  it('classifies unrecognized marketplace files as other', () => {
    expect.assertions(2)
    const result = classifyFile('marketplaces/plugins-dev-tools/tsconfig.json')
    expect(result.fileType).toBe('other')
    expect(result.pluginName).toBe('plugins-dev-tools')
  })

  it('classifies non-marketplace paths as other', () => {
    expect.assertions(1)
    const result = classifyFile('apps/api/src/index.ts')
    expect(result.fileType).toBe('other')
  })
})

// ---------------------------------------------------------------------------
// handlePluginsDocPrepare
// ---------------------------------------------------------------------------

describe('handlePluginsDocPrepare', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetRepoRoot()
  })

  it('returns up_to_date when doc is newer than source', () => {
    expect.assertions(2)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`) // getRepoRoot
    mockExecFileSync
      .mockReturnValueOnce('abc123:2026-03-28T10:00:00+00:00\n') // doc log
      .mockReturnValueOnce('2026-03-27T10:00:00+00:00\n') // source log

    const result = handlePluginsDocPrepare()
    const data = parseContent<PrepareResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.status).toBe('up_to_date')
  })

  it('returns no_history when doc has no commits', () => {
    expect.assertions(2)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync
      .mockReturnValueOnce('\n') // empty doc log
      .mockReturnValueOnce('2026-03-27T10:00:00+00:00\n')

    const result = handlePluginsDocPrepare()
    const data = parseContent<PrepareResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.status).toBe('no_history')
  })

  it('returns stale with changed files when source is newer', () => {
    expect.assertions(4)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync
      .mockReturnValueOnce('abc123:2026-03-25T10:00:00+00:00\n') // doc log (older)
      .mockReturnValueOnce('2026-03-28T10:00:00+00:00\n') // source log (newer)
      .mockReturnValueOnce(
        'M\tmarketplaces/plugins-dev-tools/skills/commit/SKILL.md\nA\tmarketplaces/plugins-dev-tools/agents/new-agent.md\n',
      ) // git diff --name-status

    const result = handlePluginsDocPrepare()
    const data = parseContent<PrepareResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.status).toBe('stale')
    expect(data.changedFiles).toHaveLength(2)
    expect(data.changedFiles[0]?.fileType).toBe('skill')
  })

  it('filters out build output directories', () => {
    expect.assertions(1)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockExecFileSync
      .mockReturnValueOnce('abc123:2026-03-25T10:00:00+00:00\n')
      .mockReturnValueOnce('2026-03-28T10:00:00+00:00\n')
      .mockReturnValueOnce(
        'M\tmarketplaces/monorepo-marketplace/plugins-dev-tools/dist/hooks/pre-tool-use.js\nM\tmarketplaces/plugins-dev-tools/skills/commit/SKILL.md\n',
      )

    const result = handlePluginsDocPrepare()
    const data = parseContent<PrepareResponse>(result)

    // Build output should be filtered out, only the SKILL.md should remain
    expect(data.changedFiles).toHaveLength(1)
  })

  it('returns error when git fails', () => {
    expect.assertions(1)

    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo')
    })

    const result = handlePluginsDocPrepare()
    expect(result.isError).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// handlePluginsDocUpdate
// ---------------------------------------------------------------------------

describe('handlePluginsDocUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetRepoRoot()
  })

  it('writes content to marketplaces/docs/plugins.md', () => {
    expect.assertions(3)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)

    const content = '# Plugin System\n\nUpdated content.\n'
    const result = handlePluginsDocUpdate({ content })
    const data = parseContent<UpdateResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.success).toBeTruthy()
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      `${MOCK_ROOT}/marketplaces/docs/plugins.md`,
      content,
    )
  })

  it('rejects empty content', () => {
    expect.assertions(2)

    const result = handlePluginsDocUpdate({ content: '' })
    const data = parseContent<UpdateResponse>(result)

    expect(result.isError).toBeTruthy()
    expect(data.success).toBeFalsy()
  })

  it('rejects whitespace-only content', () => {
    expect.assertions(2)

    const result = handlePluginsDocUpdate({ content: '   \n  \n  ' })
    const data = parseContent<UpdateResponse>(result)

    expect(result.isError).toBeTruthy()
    expect(data.success).toBeFalsy()
  })

  it('returns error when file write fails', () => {
    expect.assertions(1)

    mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    const result = handlePluginsDocUpdate({ content: '# Plugin System\n' })
    expect(result.isError).toBeTruthy()
  })
})
