import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { appendLogEntry } from './log-file.js'

describe('appendLogEntry', () => {
  const testDir = path.join(import.meta.dirname, '.test-logs')

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  it('creates a new log file with a single JSON Lines entry', async () => {
    expect.assertions(2)
    const logPath = path.join(testDir, 'test.jsonl')
    const result = await appendLogEntry(logPath, { event: 'test' })

    expect(result.isOk()).toBeTruthy()
    const content = readFileSync(logPath, 'utf8')
    expect(content).toBe('{"event":"test"}\n')
  })

  it('appends to an existing log file', async () => {
    expect.assertions(2)
    const logPath = path.join(testDir, 'test.jsonl')
    mkdirSync(testDir, { recursive: true })
    writeFileSync(logPath, '{"event":"first"}\n')

    const result = await appendLogEntry(logPath, { event: 'second' })

    expect(result.isOk()).toBeTruthy()
    const content = readFileSync(logPath, 'utf8')
    expect(content).toBe('{"event":"first"}\n{"event":"second"}\n')
  })

  it('creates parent directories recursively', async () => {
    expect.assertions(2)
    const logPath = path.join(testDir, 'nested', 'deep', 'test.jsonl')
    const result = await appendLogEntry(logPath, { event: 'nested' })

    expect(result.isOk()).toBeTruthy()
    expect(existsSync(logPath)).toBeTruthy()
  })
})
