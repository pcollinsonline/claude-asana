import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { collectMarkdownFiles, discoverPlugin, toKebabCase, toPascalCase } from './discover.js'

describe('discover', () => {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  let tmpRoot: string

  /** Create a minimal plugin structure in a temp directory. */
  const scaffold = (name: string): { distDir: string; rootDir: string } => {
    tmpRoot = path.join(tmpdir(), `discover-test-${Date.now()}-${name}`)
    const rootDir = tmpRoot
    const distDir = path.join(tmpRoot, 'dist-out')
    mkdirSync(rootDir, { recursive: true })
    writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ description: 'test plugin', name: `@test/${name}`, version: '0.1.0' }),
    )
    return { distDir, rootDir }
  }

  afterEach(() => {
    if (tmpRoot) {
      rmSync(tmpRoot, { force: true, recursive: true })
    }
  })

  // ---------------------------------------------------------------------------
  // Utility function tests
  // ---------------------------------------------------------------------------

  describe('toPascalCase', () => {
    it('converts kebab-case to PascalCase', () => {
      expect.assertions(1)
      expect(toPascalCase('pre-tool-use')).toBe('PreToolUse')
    })

    it('handles single word', () => {
      expect.assertions(1)
      expect(toPascalCase('setup')).toBe('Setup')
    })
  })

  describe('toKebabCase', () => {
    it('converts PascalCase to kebab-case', () => {
      expect.assertions(1)
      expect(toKebabCase('PreToolUse')).toBe('pre-tool-use')
    })

    it('handles single word', () => {
      expect.assertions(1)
      expect(toKebabCase('Setup')).toBe('setup')
    })
  })

  describe('collectMarkdownFiles', () => {
    it('recursively collects .md files', () => {
      expect.assertions(2)
      const { rootDir } = scaffold('md-collect')
      const subDir = path.join(rootDir, 'docs', 'sub')
      mkdirSync(subDir, { recursive: true })
      writeFileSync(path.join(rootDir, 'docs', 'README.md'), '# Hi')
      writeFileSync(path.join(subDir, 'nested.md'), '# Nested')
      writeFileSync(path.join(subDir, 'skip.txt'), 'not markdown')

      const files = collectMarkdownFiles(path.join(rootDir, 'docs'))
      expect(files).toHaveLength(2)
      expect(files.every((f) => f.endsWith('.md'))).toBeTruthy()
    })
  })

  // ---------------------------------------------------------------------------
  // discoverPlugin tests
  // ---------------------------------------------------------------------------

  describe('discoverPlugin', () => {
    it('returns empty plan for a plugin with no hooks, skills, or agents', () => {
      expect.assertions(5)
      const { distDir, rootDir } = scaffold('empty')

      const plan = discoverPlugin({ distDir, rootDir })

      expect(plan.entryPoints).toHaveLength(0)
      expect(plan.hookDirs).toHaveLength(0)
      expect(plan.skills).toHaveLength(0)
      expect(plan.agents).toHaveLength(0)
      expect(plan.mcpEntry).toBeUndefined()
    })

    it('discovers plugin-level hooks', () => {
      expect.assertions(3)
      const { distDir, rootDir } = scaffold('hooks')
      const hookDir = path.join(rootDir, 'src', 'hooks', 'pre-tool-use')
      mkdirSync(hookDir, { recursive: true })
      writeFileSync(path.join(hookDir, 'index.ts'), 'export default {}')

      const plan = discoverPlugin({ distDir, rootDir })

      expect(plan.hookDirs).toStrictEqual(['pre-tool-use'])
      expect(plan.hookEntries).toHaveLength(1)
      expect(plan.entryPoints).toHaveLength(1)
    })

    it('throws when a hook entry point is missing', () => {
      expect.assertions(1)
      const { distDir, rootDir } = scaffold('hook-missing')
      // Create directory but no index.ts
      mkdirSync(path.join(rootDir, 'src', 'hooks', 'bad-hook'), { recursive: true })

      expect(() => discoverPlugin({ distDir, rootDir })).toThrow('discovery errors')
    })

    it('discovers skill scripts from markdown references', () => {
      expect.assertions(2)
      const { distDir, rootDir } = scaffold('skill-scripts')

      // Create skill markdown with a script reference
      const skillDir = path.join(rootDir, 'skills', 'commit')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: commit\n---\nRun: !`src/skills/commit/commit.ts`',
      )

      // Create the referenced script
      const scriptDir = path.join(rootDir, 'src', 'skills', 'commit')
      mkdirSync(scriptDir, { recursive: true })
      writeFileSync(path.join(scriptDir, 'commit.ts'), 'console.log("hi")')

      const plan = discoverPlugin({ distDir, rootDir })

      expect(plan.skills).toHaveLength(1)
      expect(plan.entryPoints).toHaveLength(1)
    })

    it('throws when a referenced skill script does not exist', () => {
      expect.assertions(1)
      const { distDir, rootDir } = scaffold('skill-missing-script')

      const skillDir = path.join(rootDir, 'skills', 'bad')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: bad\n---\nRun: !`src/skills/bad/missing.ts`',
      )

      expect(() => discoverPlugin({ distDir, rootDir })).toThrow('discovery errors')
    })

    it('discovers skill hooks from SKILL.md frontmatter', () => {
      expect.assertions(2)
      const { distDir, rootDir } = scaffold('skill-hooks')

      // Create skill with hook declaration in frontmatter
      const skillDir = path.join(rootDir, 'skills', 'commit')
      mkdirSync(skillDir, { recursive: true })
      writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: commit\nhooks: [PreToolUse]\n---\nBody',
      )

      // Create the hook entry point
      const hookDir = path.join(rootDir, 'src', 'skills', 'commit', 'hooks', 'pre-tool-use')
      mkdirSync(hookDir, { recursive: true })
      writeFileSync(path.join(hookDir, 'index.ts'), 'export default {}')

      const plan = discoverPlugin({ distDir, rootDir })

      const skill = plan.skills.at(0)
      expect(skill?.hooks).toHaveLength(1)
      expect(skill?.hooks.at(0)?.eventName).toBe('PreToolUse')
    })

    it('discovers agents with script references', () => {
      expect.assertions(2)
      const { distDir, rootDir } = scaffold('agents')

      // Create agent markdown with script reference
      const agentsDir = path.join(rootDir, 'agents')
      mkdirSync(agentsDir, { recursive: true })
      writeFileSync(
        path.join(agentsDir, 'ship-it.md'),
        '---\nname: ship-it\n---\nRun: !`src/agents/ship-it/gather.ts`',
      )

      // Create the referenced script
      const scriptDir = path.join(rootDir, 'src', 'agents', 'ship-it')
      mkdirSync(scriptDir, { recursive: true })
      writeFileSync(path.join(scriptDir, 'gather.ts'), 'console.log("hi")')

      const plan = discoverPlugin({ distDir, rootDir })

      expect(plan.agents).toHaveLength(1)
      expect(plan.agents.at(0)?.scripts).toHaveLength(1)
    })

    it('validates MCP entry when mcp config is provided', () => {
      expect.assertions(1)
      const { distDir, rootDir } = scaffold('mcp')

      // Create MCP server entry
      const mcpDir = path.join(rootDir, 'src', 'mcp')
      mkdirSync(mcpDir, { recursive: true })
      writeFileSync(path.join(mcpDir, 'server.ts'), 'export default {}')

      const plan = discoverPlugin({ distDir, mcp: { name: 'test-server' }, rootDir })

      expect(plan.mcpEntry).toBe(path.join(rootDir, 'src', 'mcp', 'server.ts'))
    })

    it('throws when MCP entry does not exist', () => {
      expect.assertions(1)
      const { distDir, rootDir } = scaffold('mcp-missing')

      expect(() => discoverPlugin({ distDir, mcp: { name: 'test-server' }, rootDir })).toThrow(
        'discovery errors',
      )
    })

    it('reads package metadata and strips scope', () => {
      expect.assertions(2)
      const { distDir, rootDir } = scaffold('pkg-meta')

      const plan = discoverPlugin({ distDir, rootDir })

      expect(plan.pkg.name).toBe('pkg-meta')
      expect(plan.pkg.description).toBe('test plugin')
    })
  })
})
