import { execSync } from 'node:child_process'

import { assembleMessage, commit, normalizeHeader } from './commit.js'

vi.mock('node:child_process')

const mockExecSync = vi.mocked(execSync)

describe('normalizeHeader', () => {
  it('lowercases abbreviations in the subject', () => {
    expect.assertions(1)
    expect(normalizeHeader('feat(api): add API support for CLI')).toBe(
      'feat(api): add api support for cli',
    )
  })

  it('preserves body and footer casing', () => {
    expect.assertions(1)
    const msg = [
      'feat(api): add API support',
      '',
      'Adds REST API endpoints for the CLI tool.',
      '',
      'Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>',
    ].join('\n')

    const expected = [
      'feat(api): add api support',
      '',
      'Adds REST API endpoints for the CLI tool.',
      '',
      'Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>',
    ].join('\n')

    expect(normalizeHeader(msg)).toBe(expected)
  })

  it('handles header-only messages', () => {
    expect.assertions(1)
    expect(normalizeHeader('fix(db): resolve DB connection leak')).toBe(
      'fix(db): resolve db connection leak',
    )
  })

  it('no-ops on already-lowercase headers', () => {
    expect.assertions(1)
    const msg = 'chore(monorepo): update dependencies\n\nbump all patch versions'
    expect(normalizeHeader(msg)).toBe(msg)
  })
})

describe('assembleMessage', () => {
  it('returns header only when no body or coAuthor', () => {
    expect.assertions(1)
    expect(assembleMessage('feat: add feature')).toBe('feat: add feature')
  })

  it('joins header and body with blank line', () => {
    expect.assertions(1)
    expect(assembleMessage('feat: add feature', 'Body text here.')).toBe(
      'feat: add feature\n\nBody text here.',
    )
  })

  it('appends co-authored-by footer with angle brackets', () => {
    expect.assertions(1)
    expect(assembleMessage('feat: add feature', undefined, 'Claude Opus 4.6 (1M context)')).toBe(
      'feat: add feature\n\nCo-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>',
    )
  })

  it('assembles header, body, and footer with blank line separators', () => {
    expect.assertions(1)
    const result = assembleMessage(
      'feat(api): add endpoint',
      'Adds a new REST endpoint.',
      'Claude Opus 4.6 (1M context)',
    )
    expect(result).toBe(
      [
        'feat(api): add endpoint',
        '',
        'Adds a new REST endpoint.',
        '',
        'Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>',
      ].join('\n'),
    )
  })
})

describe('commit', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes the header and passes assembled message to git commit via stdin', () => {
    expect.assertions(2)

    commit('feat(api): add API endpoint', undefined, 'Claude')

    expect(mockExecSync).toHaveBeenCalledTimes(1)
    expect(mockExecSync).toHaveBeenCalledWith('git commit -F -', {
      encoding: 'utf8',
      input: 'feat(api): add api endpoint\n\nCo-Authored-By: Claude <noreply@anthropic.com>',
      stdio: ['pipe', 'inherit', 'inherit'],
    })
  })

  it('passes multiline messages with body intact', () => {
    expect.assertions(1)
    const expected = [
      'fix(monorepo): resolve dependency conflict',
      '',
      'The shared config package was pulling in conflicting versions.',
      '',
      'Co-Authored-By: Claude <noreply@anthropic.com>',
    ].join('\n')

    commit(
      'fix(monorepo): resolve dependency conflict',
      'The shared config package was pulling in conflicting versions.',
      'Claude',
    )

    expect(mockExecSync).toHaveBeenCalledWith('git commit -F -', {
      encoding: 'utf8',
      input: expected,
      stdio: ['pipe', 'inherit', 'inherit'],
    })
  })

  it('commits with header only', () => {
    expect.assertions(1)

    commit('feat: test')

    expect(mockExecSync).toHaveBeenCalledWith('git commit -F -', {
      encoding: 'utf8',
      input: 'feat: test',
      stdio: ['pipe', 'inherit', 'inherit'],
    })
  })

  it('captures output when captureOutput is true', () => {
    expect.assertions(1)
    mockExecSync.mockReturnValue('[main abc1234] feat: test')

    commit('feat: test', undefined, undefined, true)

    expect(mockExecSync).toHaveBeenCalledWith('git commit -F -', {
      encoding: 'utf8',
      input: 'feat: test',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  })

  it('propagates git errors', () => {
    expect.assertions(1)
    mockExecSync.mockImplementation(() => {
      throw new Error('git commit failed')
    })

    expect(() => commit('feat: test')).toThrow('git commit failed')
  })
})
