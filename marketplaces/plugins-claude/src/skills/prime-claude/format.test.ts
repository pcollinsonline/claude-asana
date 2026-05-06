import { formatAllDocs, formatDoc } from './format.js'

describe('formatDoc', () => {
  it('wraps content with separator and header', () => {
    expect.hasAssertions()
    const result = formatDoc({ content: '# Hooks\n\nContent here.', name: 'hooks' })
    const separator = '='.repeat(80)

    expect(result).toBe(
      `\n${separator}\n# Documentation: hooks\n${separator}\n\n# Hooks\n\nContent here.`,
    )
  })
})

describe('formatAllDocs', () => {
  it('returns empty string for empty array', () => {
    expect.hasAssertions()
    expect(formatAllDocs([])).toBe('')
  })

  it('concatenates multiple formatted docs', () => {
    expect.hasAssertions()
    const docs = [
      { content: 'Hooks content', name: 'hooks' },
      { content: 'Settings content', name: 'settings' },
    ]
    const result = formatAllDocs(docs)

    expect(result).toContain('# Documentation: hooks')
    expect(result).toContain('Hooks content')
    expect(result).toContain('# Documentation: settings')
    expect(result).toContain('Settings content')
  })
})
