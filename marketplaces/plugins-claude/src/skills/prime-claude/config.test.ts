import { loadConfig } from './config.js'
import { ConfigError } from './types.js'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

vi.mock('@packages/plugins-base', () => ({
  resolveProjectPath: (p: string) => `/mock/project/${p}`,
}))

const { readFileSync } = await import('node:fs')
const mockedReadFileSync = vi.mocked(readFileSync)

describe('loadConfig', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns empty config when file does not exist', () => {
    expect.assertions(2)
    mockedReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })

    const result = loadConfig()
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual({})
  })

  it('parses valid config with additional docs', () => {
    expect.assertions(2)
    const config = {
      'prime-claude': {
        docs: {
          additional: { 'my-doc': 'https://example.com/doc.md' },
        },
      },
    }
    mockedReadFileSync.mockReturnValue(JSON.stringify(config))

    const result = loadConfig()
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual(config)
  })

  it('parses valid config with disabled docs', () => {
    expect.assertions(2)
    const config = {
      'prime-claude': {
        docs: {
          disabled: ['memory', 'sub-agents'],
        },
      },
    }
    mockedReadFileSync.mockReturnValue(JSON.stringify(config))

    const result = loadConfig()
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual(config)
  })

  it('returns ConfigError for malformed JSON', () => {
    expect.assertions(2)
    mockedReadFileSync.mockReturnValue('{ not valid json')

    const result = loadConfig()
    expect(result.isErr()).toBeTruthy()
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError)
  })

  it('returns ConfigError for non-object JSON', () => {
    expect.assertions(3)
    mockedReadFileSync.mockReturnValue('"just a string"')

    const result = loadConfig()
    expect(result.isErr()).toBeTruthy()
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError)
    expect(result._unsafeUnwrapErr().message).toContain('must contain a JSON object')
  })
})
