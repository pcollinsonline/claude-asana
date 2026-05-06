import { fuzzyMatch, levenshtein } from './fuzzy-match.js'

describe('levenshtein', () => {
  interface TestCase {
    a: string
    annotation: string
    b: string
    expected: number
  }

  const testCases: TestCase[] = [
    { a: 'hooks', annotation: 'returns 0 for identical strings', b: 'hooks', expected: 0 },
    { a: '', annotation: 'returns 0 for two empty strings', b: '', expected: 0 },
    {
      a: '',
      annotation: 'returns length of other string when first is empty',
      b: 'abc',
      expected: 3,
    },
    {
      a: 'abc',
      annotation: 'returns length of other string when second is empty',
      b: '',
      expected: 3,
    },
    { a: 'hook', annotation: 'returns 1 for single insertion', b: 'hooks', expected: 1 },
    { a: 'hooks', annotation: 'returns 1 for single deletion', b: 'hook', expected: 1 },
    { a: 'hooks', annotation: 'returns 1 for single substitution', b: 'hocks', expected: 1 },
    {
      a: 'setings',
      annotation: 'returns 1 for "setings" vs "settings"',
      b: 'settings',
      expected: 1,
    },
    {
      a: 'abc',
      annotation: 'returns correct distance for completely different strings',
      b: 'xyz',
      expected: 3,
    },
    {
      a: 'kitten',
      annotation: 'returns correct distance for longer divergent strings',
      b: 'sitting',
      expected: 3,
    },
  ]

  it.each(testCases)('$annotation', ({ a, b, expected }) => {
    expect.hasAssertions()
    expect(levenshtein(a, b)).toBe(expected)
  })
})

describe('fuzzyMatch', () => {
  const defaultAvailable = ['hooks', 'memory', 'settings', 'skills', 'sub-agents']

  interface TestCase {
    annotation: string
    available?: readonly string[]
    expected: string | null
    query: string
  }

  const testCases: TestCase[] = [
    { annotation: 'returns exact match', expected: 'hooks', query: 'hooks' },
    {
      annotation: 'returns case-insensitive match for uppercase',
      expected: 'hooks',
      query: 'HOOKS',
    },
    {
      annotation: 'returns case-insensitive match for mixed case',
      expected: 'settings',
      query: 'Settings',
    },
    {
      annotation: 'returns fuzzy match for "setings"',
      expected: 'settings',
      query: 'setings',
    },
    { annotation: 'returns fuzzy match for "hook"', expected: 'hooks', query: 'hook' },
    {
      annotation: 'returns fuzzy match for "memry"',
      expected: 'memory',
      query: 'memry',
    },
    {
      annotation: 'returns null for "nonexistent" beyond distance 2',
      expected: null,
      query: 'nonexistent',
    },
    {
      annotation: 'returns null for "xyz" beyond distance 2',
      expected: null,
      query: 'xyz',
    },
    {
      annotation: 'picks closest match when multiple are within tolerance',
      expected: 'skills',
      query: 'skill',
    },
    {
      annotation: 'returns null for empty available list',
      available: [],
      expected: null,
      query: 'hooks',
    },
    {
      annotation: 'prefers exact match over fuzzy match',
      available: ['hook', 'hooks'],
      expected: 'hook',
      query: 'hook',
    },
  ]

  it.each(testCases)('$annotation', ({ available, expected, query }) => {
    expect.hasAssertions()
    expect(fuzzyMatch(query, available ?? defaultAvailable)).toBe(expected)
  })
})
