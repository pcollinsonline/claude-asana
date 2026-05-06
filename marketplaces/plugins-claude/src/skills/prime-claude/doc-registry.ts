/**
 * Registry of Claude Code documentation pages available for fetching.
 *
 * Maps local doc names to their source URLs on code.claude.com.
 * Index of all pages: https://code.claude.com/docs/llms.txt
 */

import type { PrimeClaudeConfig } from './types.js'

export const BUILTIN_DOC_REGISTRY: ReadonlyMap<string, string> = new Map([
  ['hooks', 'https://code.claude.com/docs/en/hooks.md'],
  ['memory', 'https://code.claude.com/docs/en/memory.md'],
  ['plugins', 'https://code.claude.com/docs/en/plugins'],
  ['plugins-ref', 'https://code.claude.com/docs/en/plugins-reference.md'],
  ['settings', 'https://code.claude.com/docs/en/settings.md'],
  ['skills', 'https://code.claude.com/docs/en/skills.md'],
  ['sub-agents', 'https://code.claude.com/docs/en/sub-agents.md'],
])

/** @deprecated Use BUILTIN_DOC_REGISTRY or buildEffectiveRegistry() */
export const DOC_REGISTRY = BUILTIN_DOC_REGISTRY

/**
 * Build the effective doc registry by merging built-in entries
 * with user configuration (additional docs and disabled entries).
 */
export const buildEffectiveRegistry = (config: PrimeClaudeConfig): ReadonlyMap<string, string> => {
  const docs = config['prime-claude']?.docs
  const registry = new Map(BUILTIN_DOC_REGISTRY)

  // Remove disabled built-in entries
  if (docs?.disabled) {
    for (const name of docs.disabled) {
      registry.delete(name)
    }
  }

  // Merge additional entries (user URL wins on collision with built-in)
  if (docs?.additional) {
    for (const [name, url] of Object.entries(docs.additional)) {
      registry.set(name, url)
    }
  }

  return registry
}
