import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * We test the status skill by running the entry point as a subprocess
 * to capture stdout. This mirrors how Claude Code invokes it.
 */

let tmpDir: string
let savedEnv: string | undefined

const writeManifest = (docsDir: string, manifest: Record<string, unknown>): void => {
  writeFileSync(path.join(docsDir, 'manifest.json'), JSON.stringify(manifest))
}

const runStatus = async (...args: string[]): Promise<string> => {
  // Dynamic import to re-evaluate with updated env
  // Instead we'll directly test the buildRows/renderTable logic
  // by importing the module. But since index.ts runs main() on import,
  // we need to test via subprocess.
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const execFileAsync = promisify(execFile)

  const entryPoint = path.resolve(import.meta.dirname, 'index.ts')

  const { stdout } = await execFileAsync('tsx', [entryPoint, ...args], {
    env: {
      ...process.env,
      CLAUDE_PLUGIN_DATA: tmpDir,
      CLAUDE_PROJECT_DIR: tmpDir,
    },
  })

  return stdout.trim()
}

describe('prime-claude-status', () => {
  beforeAll(async () => {
    savedEnv = process.env['CLAUDE_PLUGIN_DATA']
    tmpDir = await mkdtemp(path.join(tmpdir(), 'status-test-'))
  })

  afterAll(() => {
    if (savedEnv === undefined) {
      delete process.env['CLAUDE_PLUGIN_DATA']
    } else {
      process.env['CLAUDE_PLUGIN_DATA'] = savedEnv
    }
    rmSync(tmpDir, { recursive: true })
  })

  it('shows suggestion when no docs are loaded', async () => {
    expect.assertions(2)
    const output = await runStatus()

    expect(output).toContain('No documentation loaded')
    expect(output).toContain('/prime-claude load')
  })

  it('shows table with loaded docs', async () => {
    expect.assertions(4)
    const docsDir = path.join(tmpDir, 'docs')
    mkdirSync(docsDir, { recursive: true })
    writeFileSync(path.join(docsDir, 'hooks.md'), '# Hooks')
    writeFileSync(path.join(docsDir, 'skills.md'), '# Skills')
    writeManifest(docsDir, {
      hooks: {
        fetchedAt: '2026-03-24T06:30:00.000Z',
        lastModified: 'Mon, 24 Mar 2026 00:00:00 GMT',
      },
      skills: {
        fetchedAt: '2026-03-24T06:30:00.000Z',
        lastModified: 'Mon, 24 Mar 2026 00:00:00 GMT',
      },
    })

    const output = await runStatus()

    expect(output).toContain('Document')
    expect(output).toContain('Fetched')
    expect(output).toContain('hooks')
    expect(output).toContain('skills')
  })

  it('shows not-loaded docs from registry', async () => {
    expect.assertions(1)
    const output = await runStatus()

    // memory is in the built-in registry but not on disk
    expect(output).toContain('[not loaded]')
  })
})
