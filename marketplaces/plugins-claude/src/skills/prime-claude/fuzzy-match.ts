/**
 * Fuzzy matching utilities for resolving documentation names.
 *
 * Supports exact, case-insensitive, and Levenshtein-distance matching
 * to handle simple typos in user input.
 */

/**
 * Compute Levenshtein distance between two strings.
 */
export const levenshtein = (a: string, b: string): number => {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from<number>({ length: n + 1 }).fill(0),
  )

  for (let i = 0; i <= m; i++) {
    const row = dp[i]
    if (row) row[0] = i
  }
  for (let j = 0; j <= n; j++) {
    const row = dp[0]
    if (row) row[j] = j
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const row = dp[i]
      const prevRow = dp[i - 1]
      if (row && prevRow) {
        row[j] = Math.min(
          (prevRow[j] ?? 0) + 1,
          (row[j - 1] ?? 0) + 1,
          (prevRow[j - 1] ?? 0) + cost,
        )
      }
    }
  }

  return dp[m]?.[n] ?? 0
}

/**
 * Find the best fuzzy match for a query among available doc names.
 * Returns null if no match within tolerance (Levenshtein <= 2).
 */
export const fuzzyMatch = (query: string, available: readonly string[]): string | null => {
  const q = query.toLowerCase()

  // 1. Exact match
  const exact = available.find((name) => name === query)
  if (exact) return exact

  // 2. Case-insensitive exact match
  const caseInsensitive = available.find((name) => name.toLowerCase() === q)
  if (caseInsensitive) return caseInsensitive

  // 3. Levenshtein distance <= 2 (pick closest)
  let bestMatch: string | undefined
  let bestDist = Infinity

  for (const name of available) {
    const dist = levenshtein(q, name.toLowerCase())
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist
      bestMatch = name
    }
  }

  return bestMatch ?? null
}
