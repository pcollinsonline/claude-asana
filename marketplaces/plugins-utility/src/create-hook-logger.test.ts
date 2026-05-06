import { err, ok } from 'neverthrow'

import { createLogStage } from '@packages/plugins-base'

import type * as Config from './config.js'

import { ConfigError, isLoggingEnabled } from './config.js'
import { createHookLogger } from './create-hook-logger.js'

vi.mock('./config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof Config>()),
  isLoggingEnabled: vi.fn(),
}))

vi.mock('@packages/plugins-base', () => ({
  // eslint-disable-next-line effect/no-eta-expansion -- mock factory returns a mock fn
  createLogStage: vi.fn(() => vi.fn()),
}))

const mockIsLoggingEnabled = vi.mocked(isLoggingEnabled)
const mockCreateLogStage = vi.mocked(createLogStage)

describe('createHookLogger', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns a no-op when logging is disabled', async () => {
    expect.assertions(2)
    mockIsLoggingEnabled.mockReturnValue(ok(false))

    const logger = createHookLogger<Record<string, unknown>>('session_start')
    const result = await logger({ foo: 'bar' })

    expect(result.isOk()).toBeTruthy()
    expect(mockCreateLogStage).not.toHaveBeenCalled()
  })

  it('delegates to createLogStage when logging is enabled', () => {
    expect.assertions(1)
    mockIsLoggingEnabled.mockReturnValue(ok(true))

    createHookLogger<Record<string, unknown>>('session_start')

    expect(mockCreateLogStage).toHaveBeenCalledWith('.ai/plugins-utility/logs/session_start.jsonl')
  })

  it('passes the correct hook name to isLoggingEnabled', () => {
    expect.assertions(1)
    mockIsLoggingEnabled.mockReturnValue(ok(true))

    createHookLogger<Record<string, unknown>>('pre_tool_use')

    expect(mockIsLoggingEnabled).toHaveBeenCalledWith('pre_tool_use')
  })

  it('returns errAsync when config read fails', async () => {
    expect.assertions(2)
    const configErr = new ConfigError('bad config')
    mockIsLoggingEnabled.mockReturnValue(err(configErr))

    const logger = createHookLogger<Record<string, unknown>>('session_start')
    const result = await logger({ foo: 'bar' })

    expect(result.isErr()).toBeTruthy()
    expect(result._unsafeUnwrapErr()).toBe(configErr)
  })
})
