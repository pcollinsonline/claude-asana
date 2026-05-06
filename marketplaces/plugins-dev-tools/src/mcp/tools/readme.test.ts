import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

import {
  _resetRepoRoot,
  classifyPackageType,
  getWorkspaceDir,
  handleReadmePrepare,
  parseExports,
  parseWorkspacePatterns,
  resolvePackageTarget,
  workspacePrefixesFromPatterns,
} from './readme.js'

vi.mock('node:child_process')
vi.mock('node:fs')

const mockExecSync = vi.mocked(execSync)
const mockExecFileSync = vi.mocked(execFileSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockExistsSync = vi.mocked(existsSync)
const mockReaddirSync = vi.mocked(readdirSync)

const MOCK_ROOT = '/repo'

type ToolResult = ReturnType<typeof handleReadmePrepare>

const parseContent = <T>(result: ToolResult): T =>
  JSON.parse(result.content.at(0)?.text ?? '{}') as T

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface PrepareResponse {
  changedFiles: { path: string; status: string; workspaceDir: string | null }[]
  changedWorkspaces: string[]
  packages: {
    category: string
    existingReadme: string | null
    exports: string[] | null
    hasChanges: boolean
    packageJson: {
      description: string | null
      name: string
      scripts: Record<string, string>
      workspaceDeps: string[]
    }
    packageType: string
    workspaceDir: string
  }[]
  repoRoot: string
  root: null | {
    allPackages: {
      category: string
      description: string | null
      name: string
      workspaceDir: string
    }[]
    changedRootFiles: string[]
    existingReadme: string | null
    rootPackageJson: { engines: Record<string, string> | null; scripts: Record<string, string> }
    workspacePatterns: string[]
  }
  status: string
  target: string
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const WORKSPACE_YAML = "packages:\n  - 'apps/*'\n  - 'packages/*'\n  - 'toolchain/*'\n"

const makeDirEntry = (name: string): { isDirectory: () => boolean; name: string } => ({
  isDirectory: () => true,
  name,
})

/** Set up standard mocks for a typical monorepo. */
const setupStandardMocks = (): void => {
  // getRepoRoot
  mockExecSync.mockReturnValueOnce(`${MOCK_ROOT}\n`)

  // readFileSync dispatches by path
  mockReadFileSync.mockImplementation((filePath: unknown) => {
    const p = String(filePath)
    if (p.endsWith('pnpm-workspace.yaml')) return WORKSPACE_YAML
    if (p.endsWith('apps/web/package.json'))
      return JSON.stringify({
        description: 'Web app',
        name: '@apps/web',
        scripts: { dev: 'vite', start: 'node dist' },
      })
    if (p.endsWith('packages/utils/package.json'))
      return JSON.stringify({
        dependencies: { '@packages/core': 'workspace:*' },
        description: 'Utilities',
        name: '@packages/utils',
        scripts: { test: 'vitest' },
      })
    if (p.endsWith('toolchain/eslint-config/package.json'))
      return JSON.stringify({
        description: 'ESLint config',
        name: '@toolchain/eslint-config',
        scripts: {},
      })
    if (p.endsWith('packages/utils/src/index.ts'))
      return 'export const add = (a: number, b: number): number => a + b\nexport type Result = { value: number }\n'
    if (p.endsWith('README.md')) return '# Existing README\n'
    if (p.endsWith('package.json') && p === `${MOCK_ROOT}/package.json`)
      return JSON.stringify({
        engines: { node: '>=22' },
        scripts: { build: 'turbo build', test: 'turbo test' },
      })
    throw new Error(`ENOENT: no such file: ${p}`)
  })

  // existsSync
  mockExistsSync.mockImplementation((filePath: unknown) => {
    const p = String(filePath)
    if (p.endsWith('README.md')) return true
    if (p.endsWith('package.json')) return true
    if (
      p === `${MOCK_ROOT}/apps` ||
      p === `${MOCK_ROOT}/packages` ||
      p === `${MOCK_ROOT}/toolchain`
    )
      return true
    return false
  })

  // readdirSync for workspace discovery
  mockReaddirSync.mockImplementation((dirPath: unknown) => {
    const p = String(dirPath)
    if (p === `${MOCK_ROOT}/apps`) return [makeDirEntry('web')] as never
    if (p === `${MOCK_ROOT}/packages`) return [makeDirEntry('utils')] as never
    if (p === `${MOCK_ROOT}/toolchain`) return [makeDirEntry('eslint-config')] as never
    return [] as never
  })
}

// ---------------------------------------------------------------------------
// getWorkspaceDir
// ---------------------------------------------------------------------------

describe('getWorkspaceDir', () => {
  const prefixes = new Set(['apps', 'packages', 'toolchain', 'marketplaces'])

  it('extracts workspace dir from a package path', () => {
    expect.assertions(1)
    expect(getWorkspaceDir('packages/utils/src/index.ts', prefixes)).toBe('packages/utils')
  })

  it('extracts workspace dir from an app path', () => {
    expect.assertions(1)
    expect(getWorkspaceDir('apps/web/src/main.ts', prefixes)).toBe('apps/web')
  })

  it('returns null for root-level files', () => {
    expect.assertions(1)
    expect(getWorkspaceDir('package.json', prefixes)).toBeNull()
  })

  it('returns null for unknown prefixes', () => {
    expect.assertions(1)
    expect(getWorkspaceDir('docs/readme.md', prefixes)).toBeNull()
  })

  it('handles marketplaces prefix', () => {
    expect.assertions(1)
    expect(getWorkspaceDir('marketplaces/plugins-dev-tools/src/index.ts', prefixes)).toBe(
      'marketplaces/plugins-dev-tools',
    )
  })
})

// ---------------------------------------------------------------------------
// parseExports
// ---------------------------------------------------------------------------

describe('parseExports', () => {
  it('parses named exports', () => {
    expect.assertions(1)
    const content = 'export const foo = 1\nexport function bar() {}\nexport class Baz {}\n'
    expect(parseExports(content)).toStrictEqual(['Baz', 'bar', 'foo'])
  })

  it('parses re-exports', () => {
    expect.assertions(1)
    const content = "export { Alpha, Beta as Gamma } from './module'\n"
    expect(parseExports(content)).toStrictEqual(['Alpha', 'Gamma'])
  })

  it('parses wildcard re-exports', () => {
    expect.assertions(1)
    const content = "export * from './utils'\n"
    expect(parseExports(content)).toStrictEqual(["* from './utils'"])
  })

  it('parses type exports', () => {
    expect.assertions(1)
    const content = 'export type Foo = string\nexport interface Bar {}\nexport enum Status {}\n'
    expect(parseExports(content)).toStrictEqual(['Bar', 'Foo', 'Status'])
  })

  it('returns empty array for no exports', () => {
    expect.assertions(1)
    expect(parseExports('const internal = 1\n')).toStrictEqual([])
  })
})

// ---------------------------------------------------------------------------
// classifyPackageType
// ---------------------------------------------------------------------------

describe('classifyPackageType', () => {
  it('classifies apps category as app', () => {
    expect.assertions(1)
    expect(classifyPackageType('apps', {}, 'web')).toBe('app')
  })

  it('classifies package with dev+start as app', () => {
    expect.assertions(1)
    expect(classifyPackageType('packages', { dev: 'vite', start: 'node' }, 'server')).toBe('app')
  })

  it('classifies toolchain as config', () => {
    expect.assertions(1)
    expect(classifyPackageType('toolchain', {}, 'eslint-config')).toBe('config')
  })

  it('classifies name containing config as config', () => {
    expect.assertions(1)
    expect(classifyPackageType('packages', {}, 'typescript-config')).toBe('config')
  })

  it('classifies packages category as library', () => {
    expect.assertions(1)
    expect(classifyPackageType('packages', { test: 'vitest' }, 'utils')).toBe('library')
  })

  it('classifies unknown as tooling', () => {
    expect.assertions(1)
    expect(classifyPackageType('marketplaces', {}, 'plugins-dev-tools')).toBe('tooling')
  })
})

// ---------------------------------------------------------------------------
// parseWorkspacePatterns
// ---------------------------------------------------------------------------

describe('parseWorkspacePatterns', () => {
  it('parses workspace patterns', () => {
    expect.assertions(1)
    expect(parseWorkspacePatterns(WORKSPACE_YAML)).toStrictEqual([
      'apps/*',
      'packages/*',
      'toolchain/*',
    ])
  })

  it('handles unquoted patterns', () => {
    expect.assertions(1)
    const content = 'packages:\n  - apps/*\n  - packages/*\n'
    expect(parseWorkspacePatterns(content)).toStrictEqual(['apps/*', 'packages/*'])
  })

  it('returns empty for missing packages key', () => {
    expect.assertions(1)
    expect(parseWorkspacePatterns('something: else\n')).toStrictEqual([])
  })
})

// ---------------------------------------------------------------------------
// workspacePrefixesFromPatterns
// ---------------------------------------------------------------------------

describe('workspacePrefixesFromPatterns', () => {
  it('extracts prefixes from glob patterns', () => {
    expect.assertions(1)
    expect(workspacePrefixesFromPatterns(['apps/*', 'packages/*', 'toolchain/*'])).toStrictEqual(
      new Set(['apps', 'packages', 'toolchain']),
    )
  })

  it('returns empty set for empty patterns', () => {
    expect.assertions(1)
    expect(workspacePrefixesFromPatterns([])).toStrictEqual(new Set())
  })
})

// ---------------------------------------------------------------------------
// resolvePackageTarget
// ---------------------------------------------------------------------------

describe('resolvePackageTarget', () => {
  const dirs = ['apps/web', 'packages/utils', 'toolchain/eslint-config']
  const prefixes = new Set(['apps', 'packages', 'toolchain'])

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves exact workspace dir', () => {
    expect.assertions(1)
    expect(resolvePackageTarget('packages/utils', MOCK_ROOT, dirs, prefixes)).toBe('packages/utils')
  })

  it('resolves by directory name', () => {
    expect.assertions(1)
    expect(resolvePackageTarget('utils', MOCK_ROOT, dirs, prefixes)).toBe('packages/utils')
  })

  it('resolves by scoped package name', () => {
    expect.assertions(1)
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const p = String(filePath)
      if (p.endsWith('apps/web/package.json')) return JSON.stringify({ name: '@hsc/web' })
      if (p.endsWith('packages/utils/package.json')) return JSON.stringify({ name: '@hsc/utils' })
      if (p.endsWith('toolchain/eslint-config/package.json'))
        return JSON.stringify({ name: '@hsc/eslint-config' })
      throw new Error('ENOENT')
    })
    expect(resolvePackageTarget('@hsc/utils', MOCK_ROOT, dirs, prefixes)).toBe('packages/utils')
  })

  it('strips @ prefix when it forms a workspace path', () => {
    expect.assertions(1)
    expect(resolvePackageTarget('@packages/utils', MOCK_ROOT, dirs, prefixes)).toBe(
      'packages/utils',
    )
  })

  it('strips trailing slashes', () => {
    expect.assertions(1)
    expect(resolvePackageTarget('packages/utils/', MOCK_ROOT, dirs, prefixes)).toBe(
      'packages/utils',
    )
  })

  it('strips @ prefix and trailing slash together', () => {
    expect.assertions(1)
    expect(resolvePackageTarget('@packages/utils/', MOCK_ROOT, dirs, prefixes)).toBe(
      'packages/utils',
    )
  })

  it('trims whitespace', () => {
    expect.assertions(1)
    expect(resolvePackageTarget(' packages/utils ', MOCK_ROOT, dirs, prefixes)).toBe(
      'packages/utils',
    )
  })

  it('returns null for unknown target', () => {
    expect.assertions(1)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(resolvePackageTarget('nonexistent', MOCK_ROOT, dirs, prefixes)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// handleReadmePrepare
// ---------------------------------------------------------------------------

describe('handleReadmePrepare', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetRepoRoot()
  })

  it('returns error when target is omitted', () => {
    expect.assertions(2)

    const result = handleReadmePrepare({})

    expect(result.isError).toBeTruthy()
    expect(result.content[0]?.text).toContain('target is required')
  })

  it('returns up_to_date when no files changed and all READMEs exist', () => {
    expect.assertions(3)
    setupStandardMocks()

    // git diff --name-status main..HEAD returns empty
    mockExecFileSync.mockReturnValueOnce('\n')

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.status).toBe('up_to_date')
    expect(data.packages).toHaveLength(0)
  })

  it('returns up_to_date for single package with no changes', () => {
    expect.assertions(2)
    setupStandardMocks()

    // git diff returns changes in a different package
    mockExecFileSync.mockReturnValueOnce('M\tapps/web/src/main.ts\n')

    const result = handleReadmePrepare({ target: 'utils' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.status).toBe('up_to_date')
    expect(data.target).toBe('utils')
  })

  it('returns stale with package metadata when source files changed', () => {
    expect.assertions(5)
    setupStandardMocks()

    // git diff returns changes in packages/utils (source file, not package.json)
    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/src/index.ts\n')

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.status).toBe('stale')
    expect(data.changedWorkspaces).toContain('packages/utils')
    expect(data.packages.length).toBeGreaterThan(0)
    // Root should NOT be included — only a source file changed, not a package.json
    expect(data.root).toBeNull()
  })

  it('includes root metadata when workspace package.json changes detected in * mode', () => {
    expect.assertions(4)
    setupStandardMocks()

    // A workspace package.json change affects the root README packages table
    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/package.json\n')

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.status).toBe('stale')
    expect(data.root).not.toBeNull()
    expect(data.root?.allPackages.length).toBeGreaterThan(0)
    expect(data.root?.workspacePatterns).toStrictEqual(['apps/*', 'packages/*', 'toolchain/*'])
  })

  it('excludes root metadata in * mode when only package source files changed', () => {
    expect.assertions(2)
    setupStandardMocks()

    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/src/helper.ts\n')

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.status).toBe('stale')
    expect(data.root).toBeNull()
  })

  it('returns stale for root-only target when root files changed', () => {
    expect.assertions(3)
    setupStandardMocks()

    // Root-level file change
    mockExecFileSync.mockReturnValueOnce('M\tpackage.json\n')

    const result = handleReadmePrepare({ target: 'root' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.status).toBe('stale')
    expect(data.target).toBe('root')
    expect(data.root).not.toBeNull()
  })

  it('returns up_to_date for root target when nothing changed', () => {
    expect.assertions(2)
    setupStandardMocks()

    mockExecFileSync.mockReturnValueOnce('\n')

    const result = handleReadmePrepare({ target: 'root' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.status).toBe('up_to_date')
    expect(data.target).toBe('root')
  })

  it('returns up_to_date for root target when only package source files changed', () => {
    expect.assertions(2)
    setupStandardMocks()

    // Source file change in a package — does NOT affect the root README
    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/src/helper.ts\n')

    const result = handleReadmePrepare({ target: 'root' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.status).toBe('up_to_date')
    expect(data.root).toBeNull()
  })

  it('returns stale for root target when a workspace package.json changed', () => {
    expect.assertions(3)
    setupStandardMocks()

    // A workspace package.json change affects the root README packages table
    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/package.json\n')

    const result = handleReadmePrepare({ target: 'root' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.status).toBe('stale')
    expect(data.target).toBe('root')
    expect(data.root).not.toBeNull()
  })

  it('returns no_history when git diff fails for both refs', () => {
    expect.assertions(3)
    setupStandardMocks()

    // Both git diff calls fail
    mockExecFileSync
      .mockImplementationOnce(() => {
        throw new Error('unknown revision')
      })
      .mockImplementationOnce(() => {
        throw new Error('unknown revision')
      })

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    expect(result.isError).toBeUndefined()
    expect(data.status).toBe('no_history')
    expect(data.packages.length).toBeGreaterThan(0)
  })

  it('uses provided baseRef for change detection', () => {
    expect.assertions(1)
    setupStandardMocks()

    mockExecFileSync.mockReturnValueOnce('\n')

    handleReadmePrepare({ baseRef: 'develop', target: '*' })

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-status', 'develop..HEAD'],
      expect.objectContaining({ cwd: MOCK_ROOT }),
    )
  })

  it('falls back to origin/main when main ref fails', () => {
    expect.assertions(1)
    setupStandardMocks()

    // First call (main) fails, second (origin/main) succeeds
    mockExecFileSync
      .mockImplementationOnce(() => {
        throw new Error('unknown revision')
      })
      .mockReturnValueOnce('\n')

    handleReadmePrepare({ target: '*' })

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['diff', '--name-status', 'origin/main..HEAD'],
      expect.objectContaining({ cwd: MOCK_ROOT }),
    )
  })

  it('returns error for unknown package target', () => {
    expect.assertions(2)
    setupStandardMocks()

    const result = handleReadmePrepare({ target: 'nonexistent' })

    expect(result.isError).toBeTruthy()
    expect(result.content[0]?.text).toContain('Package not found')
  })

  it('returns error when not a git repo', () => {
    expect.assertions(1)

    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repo')
    })

    const result = handleReadmePrepare({ target: '*' })
    expect(result.isError).toBeTruthy()
  })

  it('gathers exports from src/index.ts for changed packages', () => {
    expect.assertions(2)
    setupStandardMocks()

    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/src/index.ts\n')

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    const utilsPkg = data.packages.find((p) => p.workspaceDir === 'packages/utils')
    expect(utilsPkg?.exports).toContain('add')
    expect(utilsPkg?.exports).toContain('Result')
  })

  it('classifies package types correctly', () => {
    expect.assertions(3)
    setupStandardMocks()

    // Changes in all workspaces
    mockExecFileSync.mockReturnValueOnce(
      'M\tapps/web/src/main.ts\nM\tpackages/utils/src/index.ts\nM\ttoolchain/eslint-config/index.js\n',
    )

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    const web = data.packages.find((p) => p.workspaceDir === 'apps/web')
    const utils = data.packages.find((p) => p.workspaceDir === 'packages/utils')
    const eslint = data.packages.find((p) => p.workspaceDir === 'toolchain/eslint-config')

    expect(web?.packageType).toBe('app')
    expect(utils?.packageType).toBe('library')
    expect(eslint?.packageType).toBe('config')
  })

  it('includes changed root files in root metadata', () => {
    expect.assertions(1)
    setupStandardMocks()

    // Root-level change triggers root metadata inclusion
    mockExecFileSync.mockReturnValueOnce('M\tdocker-compose.yml\nM\t.nvmrc\n')

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.root?.changedRootFiles).toStrictEqual(['docker-compose.yml', '.nvmrc'])
  })

  it('includes workspace deps in package metadata', () => {
    expect.assertions(1)
    setupStandardMocks()

    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/src/index.ts\n')

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    const utils = data.packages.find((p) => p.workspaceDir === 'packages/utils')
    expect(utils?.packageJson.workspaceDeps).toStrictEqual(['@packages/core'])
  })

  it('returns empty warnings on success', () => {
    expect.assertions(1)
    setupStandardMocks()

    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/src/index.ts\n')

    const result = handleReadmePrepare({ target: '*' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.warnings).toStrictEqual([])
  })

  it('warns when a workspace package.json is missing', () => {
    expect.assertions(2)
    setupStandardMocks()

    // Override readFileSync to fail for packages/utils/package.json
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const p = String(filePath)
      if (p.endsWith('packages/utils/package.json')) throw new Error('ENOENT')
      if (p.endsWith('apps/web/package.json'))
        return JSON.stringify({ name: '@apps/web', scripts: {} })
      if (p.endsWith('toolchain/eslint-config/package.json'))
        return JSON.stringify({ name: '@toolchain/eslint-config', scripts: {} })
      if (p.endsWith('pnpm-workspace.yaml'))
        return "packages:\n  - 'apps/*'\n  - 'packages/*'\n  - 'toolchain/*'\n"
      if (p.endsWith('README.md')) return '# Existing README\n'
      if (p === `${MOCK_ROOT}/package.json`)
        return JSON.stringify({ scripts: { build: 'turbo build' } })
      throw new Error(`ENOENT: no such file: ${p}`)
    })

    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/src/index.ts\n')

    const result = handleReadmePrepare({ target: 'packages/utils' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.packages).toHaveLength(0)
    expect(data.warnings).toStrictEqual(['packages/utils: package.json not found'])
  })

  it('warns when a workspace package.json is malformed', () => {
    expect.assertions(2)
    setupStandardMocks()

    // Override readFileSync to return invalid JSON for packages/utils
    mockReadFileSync.mockImplementation((filePath: unknown) => {
      const p = String(filePath)
      if (p.endsWith('packages/utils/package.json')) return '{invalid json'
      if (p.endsWith('apps/web/package.json'))
        return JSON.stringify({ name: '@apps/web', scripts: {} })
      if (p.endsWith('toolchain/eslint-config/package.json'))
        return JSON.stringify({ name: '@toolchain/eslint-config', scripts: {} })
      if (p.endsWith('pnpm-workspace.yaml'))
        return "packages:\n  - 'apps/*'\n  - 'packages/*'\n  - 'toolchain/*'\n"
      if (p.endsWith('README.md')) return '# Existing README\n'
      if (p === `${MOCK_ROOT}/package.json`)
        return JSON.stringify({ scripts: { build: 'turbo build' } })
      throw new Error(`ENOENT: no such file: ${p}`)
    })

    mockExecFileSync.mockReturnValueOnce('M\tpackages/utils/src/index.ts\n')

    const result = handleReadmePrepare({ target: 'packages/utils' })
    const data = parseContent<PrepareResponse>(result)

    expect(data.packages).toHaveLength(0)
    expect(data.warnings).toStrictEqual(['packages/utils: malformed package.json'])
  })
})
