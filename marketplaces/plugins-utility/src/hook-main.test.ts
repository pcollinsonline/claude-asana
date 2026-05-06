import { deriveHookName, deriveLabel } from './hook-main.js'

describe('deriveHookName', () => {
  it('converts kebab-case filename to snake_case', () => {
    expect.assertions(1)
    expect(deriveHookName('/dist/hooks/pre-tool-use.js')).toBe('pre_tool_use')
  })

  it('strips .js extension', () => {
    expect.assertions(1)
    expect(deriveHookName('/dist/hooks/stop.js')).toBe('stop')
  })

  it('handles deeply nested paths', () => {
    expect.assertions(1)
    expect(deriveHookName('/home/user/.claude/plugins/cache/dist/hooks/session-start.js')).toBe(
      'session_start',
    )
  })

  it('handles multi-segment hook names', () => {
    expect.assertions(1)
    expect(deriveHookName('/dist/hooks/post-tool-use-failure.js')).toBe('post_tool_use_failure')
  })

  it('handles single-word hook names', () => {
    expect.assertions(1)
    expect(deriveHookName('/dist/hooks/notification.js')).toBe('notification')
  })
})

describe('deriveLabel', () => {
  it('converts underscores to spaces', () => {
    expect.assertions(1)
    expect(deriveLabel('pre_tool_use')).toBe('pre tool use')
  })

  it('handles single-word names', () => {
    expect.assertions(1)
    expect(deriveLabel('stop')).toBe('stop')
  })
})
