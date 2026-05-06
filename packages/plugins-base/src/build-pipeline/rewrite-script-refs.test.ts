import { rewriteScriptRefs } from './rewrite-script-refs.js'

describe('rewriteScriptRefs', () => {
  it('rewrites command blocks to bundled JS paths', () => {
    expect.assertions(1)
    const input = 'Run: !`src/skills/commit/commit.ts`'
    const result = rewriteScriptRefs(input, 'skills', 'commit')
    expect(result).toBe(
      'Run: !`node ${CLAUDE_PLUGIN_ROOT}/dist/skills/commit/commit.js $ARGUMENTS`',
    )
  })

  it('preserves env-var assignments in command blocks', () => {
    expect.assertions(1)
    const input = '!`FOO=bar BAZ=qux src/skills/commit/commit.ts`'
    const result = rewriteScriptRefs(input, 'skills', 'commit')
    expect(result).toBe(
      '!`FOO=bar BAZ=qux node ${CLAUDE_PLUGIN_ROOT}/dist/skills/commit/commit.js $ARGUMENTS`',
    )
  })

  it('rewrites bare path references in prose', () => {
    expect.assertions(1)
    const input = 'The script at src/skills/commit/commit.ts handles commits.'
    const result = rewriteScriptRefs(input, 'skills', 'commit')
    expect(result).toBe(
      'The script at ${CLAUDE_PLUGIN_ROOT}/dist/skills/commit/commit.js handles commits.',
    )
  })

  it('works with agent component type', () => {
    expect.assertions(1)
    const input = 'See src/agents/ship-it/gather-state.ts for details.'
    const result = rewriteScriptRefs(input, 'agents', 'ship-it')
    expect(result).toBe(
      'See ${CLAUDE_PLUGIN_ROOT}/dist/agents/ship-it/gather-state.js for details.',
    )
  })

  it('handles nested paths', () => {
    expect.assertions(1)
    const input = 'Script: src/skills/create-issue/sub/deep/script.ts'
    const result = rewriteScriptRefs(input, 'skills', 'create-issue')
    expect(result).toBe('Script: ${CLAUDE_PLUGIN_ROOT}/dist/skills/create-issue/sub/deep/script.js')
  })

  it('rewrites multiple refs in one file', () => {
    expect.assertions(2)
    const input = ['!`src/skills/foo/a.ts`', 'Also see src/skills/foo/b.ts'].join('\n')
    const result = rewriteScriptRefs(input, 'skills', 'foo')
    expect(result).toContain('dist/skills/foo/a.js')
    expect(result).toContain('dist/skills/foo/b.js')
  })

  it('returns content unchanged when no refs match', () => {
    expect.assertions(1)
    const input = 'No script references here.'
    expect(rewriteScriptRefs(input, 'skills', 'commit')).toBe(input)
  })
})
