#!/usr/bin/env tsx
/**
 * prime-claude — Skill preprocessor that resolves and outputs documentation
 * files into a skill's context, or fetches them from code.claude.com.
 *
 * Unlike core hooks, this does not read from stdin. It receives
 * doc names as command-line arguments and outputs file contents to stdout.
 *
 * Usage:
 *   tsx index.ts                  → output all *.md docs
 *   tsx index.ts hooks            → output hooks.md
 *   tsx index.ts hooks settings   → output hooks.md and settings.md
 *   tsx index.ts setings          → fuzzy-matches to settings.md
 *   tsx index.ts load             → fetch all docs from code.claude.com
 *   tsx index.ts load hooks       → fetch only hooks.md
 *   tsx index.ts load --force     → re-fetch all docs, ignoring cache
 */

import { existsSync, readdirSync } from 'node:fs'

import { loadConfig } from './config.js'
import { buildEffectiveRegistry } from './doc-registry.js'
import { fetchDocs } from './fetch-docs.js'
import { formatDoc } from './format.js'
import { checkStaleness, resolveDocs, resolveDocsDir } from './resolve-docs.js'
import { type PrimeClaudeConfig, DocNotFoundError } from './types.js'

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

const handleLoad = async (
  names: readonly string[],
  registry: ReadonlyMap<string, string>,
  force?: boolean,
): Promise<void> => {
  const docsDir = resolveDocsDir()
  const result = await fetchDocs(docsDir, registry, names.length > 0 ? names : undefined, force)

  result.match(
    (results) => {
      const fetched = results.filter((r) => r.status === 'fetched')
      const upToDate = results.filter((r) => r.status === 'up-to-date')

      const parts: string[] = []
      if (fetched.length > 0) {
        parts.push(`fetched: ${fetched.map((r) => r.name).join(', ')}`)
      }
      if (upToDate.length > 0) {
        parts.push(`up to date: ${upToDate.map((r) => r.name).join(', ')}`)
      }

      console.log(`${results.length} document(s) — ${parts.join('; ')}`)
    },
    (error) => {
      console.log(`ERROR: ${error.message}`)
    },
  )
}

const handleResolve = async (
  args: readonly string[],
  registry: ReadonlyMap<string, string>,
): Promise<void> => {
  const docsDir = resolveDocsDir()
  const hasDocFiles = existsSync(docsDir) && readdirSync(docsDir).some((f) => f.endsWith('.md'))

  if (!hasDocFiles) {
    const available = [...registry.keys()].join(', ')
    console.log(
      `ERROR: Documentation not loaded. Run \`/prime-claude load\` to fetch docs from Anthropic.\nAvailable docs: ${available}`,
    )
    return
  }

  const result = await resolveDocs(args, [...registry.keys()])

  result.match(
    (docs) => {
      for (const doc of docs) {
        console.log(formatDoc(doc))
      }

      // Staleness warning (stderr so it doesn't pollute doc output)
      const stalenessResult = checkStaleness(
        docsDir,
        docs.map((d) => d.name),
      )
      stalenessResult.map((stale) => {
        if (stale.length > 0) {
          console.error(
            `\nNote: The following docs were fetched over 30 days ago and may be outdated: ${stale.join(', ')}` +
              '\nRun `/prime-claude load` to refresh them.',
          )
        }
      })
    },
    (error) => {
      if (error instanceof DocNotFoundError) {
        console.log(
          `ERROR: Could not find documentation matching '${error.query}'. Available docs: ${error.available.join(', ')}`,
        )
      } else {
        console.log(`ERROR: ${error.message}`)
      }
    },
  )
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const rawArgs = process.argv.slice(2).filter((a) => a.trim() !== '')
  const force = rawArgs.includes('--force')
  const cliArgs = rawArgs.filter((a) => a !== '--force')

  // Load config — fall back to empty config on error (warn to stderr)
  let config: PrimeClaudeConfig = {}
  const configResult = loadConfig()
  if (configResult.isErr()) {
    console.error(`Warning: Failed to load config: ${configResult.error.message}`)
  } else {
    config = configResult.value
  }

  const registry = buildEffectiveRegistry(config)

  await (cliArgs[0] === 'load'
    ? handleLoad(cliArgs.slice(1), registry, force)
    : handleResolve(cliArgs, registry))
}

void main()
