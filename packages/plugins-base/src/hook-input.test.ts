import { Readable } from 'node:stream'

import { parseHookInput, readStdin } from './hook-input.js'
import { HookInputError } from './types.js'

describe('parseHookInput', () => {
  it('parses valid JSON into the specified type', () => {
    expect.assertions(2)
    const result = parseHookInput<{ name: string }>('{"name":"test"}')
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual({ name: 'test' })
  })

  it('returns HookInputError for invalid JSON', () => {
    expect.assertions(2)
    const result = parseHookInput<unknown>('not json')
    expect(result.isErr()).toBeTruthy()
    expect(result._unsafeUnwrapErr()).toBeInstanceOf(HookInputError)
  })

  it('parses empty object', () => {
    expect.assertions(2)
    const result = parseHookInput<Record<string, unknown>>('{}')
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toStrictEqual({})
  })
})

describe('readStdin', () => {
  const originalStdin = process.stdin

  afterEach(() => {
    Object.defineProperty(process, 'stdin', { value: originalStdin })
  })

  it('reads data from stdin stream', async () => {
    expect.assertions(2)
    const mockStdin = Readable.from([Buffer.from('{"hello":"world"}')])
    Object.defineProperty(process, 'stdin', { value: mockStdin })

    const result = await readStdin()
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toBe('{"hello":"world"}')
  })

  it('returns empty string when stdin is already closed', async () => {
    expect.assertions(2)
    const mockStdin = Readable.from([])
    Object.defineProperty(mockStdin, 'readableEnded', { value: true })
    Object.defineProperty(process, 'stdin', { value: mockStdin })

    const result = await readStdin()
    expect(result.isOk()).toBeTruthy()
    expect(result._unsafeUnwrap()).toBe('')
  })
})
