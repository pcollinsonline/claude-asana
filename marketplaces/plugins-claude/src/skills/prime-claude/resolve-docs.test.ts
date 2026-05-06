import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { checkStaleness, resolveDocs } from './resolve-docs.js'
import { DocNotFoundError } from './types.js'

let tmpDir: string
let savedEnv: string | undefined

const testDocs: Record<string, string> = {
  hooks: '# Hooks\n\nHooks documentation content.',
  memory: '# Memory\n\nMemory documentation content.',
  settings: '# Settings\n\nSettings documentation content.',
  skills: '# Skills\n\nSkills documentation content.',
  'sub-agents': '# Sub-Agents\n\nSub-agents documentation content.',
}

describe('resolveDocs', () => {
  beforeAll(async () => {
    savedEnv = process.env['CLAUDE_PLUGIN_DATA']
    tmpDir = await mkdtemp(path.join(tmpdir(), 'prime-claude-test-'))
    process.env['CLAUDE_PLUGIN_DATA'] = tmpDir

    const docsDir = path.join(tmpDir, 'docs')
    mkdirSync(docsDir, { recursive: true })
    for (const [name, content] of Object.entries(testDocs)) {
      writeFileSync(path.join(docsDir, `${name}.md`), content)
    }
  })

  afterAll(() => {
    if (savedEnv === undefined) {
      delete process.env['CLAUDE_PLUGIN_DATA']
    } else {
      process.env['CLAUDE_PLUGIN_DATA'] = savedEnv
    }
    rmSync(tmpDir, { recursive: true })
  })

  interface SuccessTestCase {
    readonly annotation: string
    readonly args: readonly string[]
    readonly expectedNames: readonly string[]
  }

  const successCases: SuccessTestCase[] = [
    {
      annotation: 'loads all docs when no args provided',
      args: [],
      expectedNames: ['hooks', 'memory', 'settings', 'skills', 'sub-agents'],
    },
    {
      annotation: 'loads a single doc by exact name',
      args: ['hooks'],
      expectedNames: ['hooks'],
    },
    {
      annotation: 'loads multiple docs',
      args: ['hooks', 'settings'],
      expectedNames: ['hooks', 'settings'],
    },
    {
      annotation: 'fuzzy matches a typo',
      args: ['setings'],
      expectedNames: ['settings'],
    },
    {
      annotation: 'deduplicates repeated arguments',
      args: ['hooks', 'hooks'],
      expectedNames: ['hooks'],
    },
  ]

  it.each(successCases)('$annotation', async ({ args, expectedNames }) => {
    expect.hasAssertions()
    const result = await resolveDocs(args)

    expect(result.isOk()).toBeTruthy()
    const docs = result._unsafeUnwrap()
    expect(docs.map((d) => d.name)).toStrictEqual(expectedNames)
    for (const doc of docs) {
      expect(doc.content).toBeTruthy()
    }
  })

  it('returns doc content', async () => {
    expect.assertions(3)
    const result = await resolveDocs(['hooks'])

    expect(result.isOk()).toBeTruthy()
    const docs = result._unsafeUnwrap()
    expect(docs[0]?.name).toBe('hooks')
    expect(docs[0]?.content).toBe('# Hooks\n\nHooks documentation content.')
  })

  interface ErrorTestCase {
    readonly annotation: string
    readonly args: readonly string[]
    readonly expectedQuery: string
  }

  const errorCases: ErrorTestCase[] = [
    {
      annotation: 'fails for unmatched argument',
      args: ['nonexistent'],
      expectedQuery: 'nonexistent',
    },
    {
      annotation: 'fails at first unmatched argument',
      args: ['hooks', 'nonexistent'],
      expectedQuery: 'nonexistent',
    },
  ]

  it.each(errorCases)('$annotation', async ({ args, expectedQuery }) => {
    expect.hasAssertions()
    const result = await resolveDocs(args)

    expect(result.isErr()).toBeTruthy()
    const error = result._unsafeUnwrapErr() as DocNotFoundError
    expect(error).toBeInstanceOf(DocNotFoundError)
    expect(error.query).toBe(expectedQuery)
    expect(error.available).toStrictEqual(['hooks', 'memory', 'settings', 'skills', 'sub-agents'])
  })

  it('excludes disabled docs when allowedNames is provided', async () => {
    expect.assertions(2)
    const allowed = ['memory', 'settings', 'skills', 'sub-agents'] // hooks excluded
    const result = await resolveDocs([], allowed)

    expect(result.isOk()).toBeTruthy()
    const docs = result._unsafeUnwrap()
    expect(docs.map((d) => d.name)).toStrictEqual(['memory', 'settings', 'skills', 'sub-agents'])
  })

  it('returns error when requesting a disabled doc by name', async () => {
    expect.assertions(3)
    const allowed = ['memory', 'settings', 'skills', 'sub-agents'] // hooks excluded
    const result = await resolveDocs(['hooks'], allowed)

    expect(result.isErr()).toBeTruthy()
    const error = result._unsafeUnwrapErr() as DocNotFoundError
    expect(error).toBeInstanceOf(DocNotFoundError)
    expect(error.query).toBe('hooks')
  })
})

describe('checkStaleness', () => {
  let stalenessDir: string

  beforeAll(async () => {
    stalenessDir = await mkdtemp(path.join(tmpdir(), 'staleness-test-'))
    mkdirSync(path.join(stalenessDir, 'docs'), { recursive: true })
  })

  afterAll(() => {
    rmSync(stalenessDir, { recursive: true })
  })

  it('returns empty when no manifest exists', () => {
    expect.assertions(2)
    const emptyDir = path.join(stalenessDir, 'no-manifest')
    mkdirSync(emptyDir, { recursive: true })
    const result = checkStaleness(emptyDir, ['hooks', 'settings'])

    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual([])
  })

  it('returns empty when docs are recent', () => {
    expect.assertions(2)
    const docsDir = path.join(stalenessDir, 'docs')
    const manifest = {
      hooks: { fetchedAt: new Date().toISOString(), lastModified: null },
    }
    writeFileSync(path.join(docsDir, 'manifest.json'), JSON.stringify(manifest))

    const result = checkStaleness(docsDir, ['hooks'])
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual([])
  })

  it('returns stale doc names when fetchedAt is old', () => {
    expect.assertions(2)
    const docsDir = path.join(stalenessDir, 'docs')
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    const manifest = {
      hooks: { fetchedAt: oldDate, lastModified: null },
      settings: { fetchedAt: new Date().toISOString(), lastModified: null },
    }
    writeFileSync(path.join(docsDir, 'manifest.json'), JSON.stringify(manifest))

    const result = checkStaleness(docsDir, ['hooks', 'settings'])
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual(['hooks'])
  })

  it('does not report docs missing from manifest as stale', () => {
    expect.assertions(2)
    const docsDir = path.join(stalenessDir, 'docs')
    writeFileSync(path.join(docsDir, 'manifest.json'), '{}')

    const result = checkStaleness(docsDir, ['hooks'])
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual([])
  })
})
