import { readFileSync } from 'node:fs'

import { ConfigError, isLoggingEnabled } from './config.js'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

vi.mock('@packages/plugins-base', () => ({
  resolveProjectPath: (p: string) => `/mock-root/${p}`,
}))

const mockReadFileSync = vi.mocked(readFileSync)

describe('isLoggingEnabled', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok(true) when no config file exists', () => {
    expect.assertions(1)
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(isLoggingEnabled('session_start')._unsafeUnwrap()).toBeTruthy()
  })

  it('returns ok(true) when config is empty object', () => {
    expect.assertions(1)
    mockReadFileSync.mockReturnValue('{}')
    expect(isLoggingEnabled('session_start')._unsafeUnwrap()).toBeTruthy()
  })

  it('returns ok(true) when logging key has no disabled array', () => {
    expect.assertions(1)
    mockReadFileSync.mockReturnValue('{"logging":{}}')
    expect(isLoggingEnabled('session_start')._unsafeUnwrap()).toBeTruthy()
  })

  it('returns ok(false) when hook is in disabled list', () => {
    expect.assertions(1)
    mockReadFileSync.mockReturnValue('{"logging":{"disabled":["session_start","stop"]}}')
    expect(isLoggingEnabled('session_start')._unsafeUnwrap()).toBeFalsy()
  })

  it('returns ok(true) when hook is not in disabled list', () => {
    expect.assertions(1)
    mockReadFileSync.mockReturnValue('{"logging":{"disabled":["stop"]}}')
    expect(isLoggingEnabled('session_start')._unsafeUnwrap()).toBeTruthy()
  })

  it('returns err(ConfigError) when config is malformed JSON', () => {
    expect.assertions(2)
    mockReadFileSync.mockReturnValue('not json {{{')
    const result = isLoggingEnabled('session_start')
    expect(result.isErr()).toBeTruthy()
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError)
  })

  it('returns err(ConfigError) when config is a non-object JSON value', () => {
    expect.assertions(2)
    mockReadFileSync.mockReturnValue('"just a string"')
    const result = isLoggingEnabled('session_start')
    expect(result.isErr()).toBeTruthy()
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(ConfigError)
  })

  it('preserves the cause on parse errors', () => {
    expect.assertions(1)
    mockReadFileSync.mockReturnValue('not json {{{')
    const result = isLoggingEnabled('session_start')
    expect(result._unsafeUnwrapErr().cause).toBeDefined()
  })
})
