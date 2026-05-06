/**
 * Shared formatting utilities for prime-claude documentation output.
 */

import type { ResolvedDoc } from './types.js'

/**
 * Format a single resolved doc with separator and header.
 */
export const formatDoc = (doc: ResolvedDoc): string => {
  const separator = '='.repeat(80)
  return `\n${separator}\n# Documentation: ${doc.name}\n${separator}\n\n${doc.content}`
}

/**
 * Format all resolved docs into a single string.
 */
// eslint-disable-next-line unicorn/no-array-callback-reference -- formatDoc signature matches map callback; eta-expansion conflicts with effect/no-eta-expansion
export const formatAllDocs = (docs: readonly ResolvedDoc[]): string => docs.map(formatDoc).join('')
