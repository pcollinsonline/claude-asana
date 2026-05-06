#!/usr/bin/env tsx
/**
 * prime-claude-status — Shows the status of loaded documentation,
 * including fetch timestamps, enabled/disabled state, and optionally
 * checks remote sources for updates.
 *
 * Usage:
 *   tsx index.ts          → show status table
 *   tsx index.ts check    → show status table with remote freshness check
 */

import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import type { Manifest, PrimeClaudeConfig } from '../prime-claude/types.js'

import { loadConfig } from '../prime-claude/config.js'
import { buildEffectiveRegistry, BUILTIN_DOC_REGISTRY } from '../prime-claude/doc-registry.js'
import { readManifest } from '../prime-claude/manifest.js'
import { resolveDocsDir } from '../prime-claude/resolve-docs.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const checkRemote = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok ? res.headers.get('Last-Modified') : null
  } catch {
    return null
  }
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

const formatDate = (isoDate: string): string => {
  const d = new Date(isoDate)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

const formatHttpDate = (httpDate: string): string => {
  const d = new Date(httpDate)
  if (Number.isNaN(d.getTime())) return httpDate
  return formatDate(d.toISOString())
}

// ---------------------------------------------------------------------------
// Build rows
// ---------------------------------------------------------------------------

const buildRows = async (config: PrimeClaudeConfig, check: boolean): Promise<string[][]> => {
  const effectiveRegistry = buildEffectiveRegistry(config)
  const disabledNames = new Set(config['prime-claude']?.docs?.disabled)

  // Collect all known doc names: built-in + additional + any on disk
  const docsDir = resolveDocsDir()
  const onDisk = new Set<string>()
  if (existsSync(docsDir)) {
    for (const f of readdirSync(docsDir)) {
      if (f.endsWith('.md')) {
        onDisk.add(path.basename(f, '.md'))
      }
    }
  }

  // Build full list of doc names (registry + on-disk, deduplicated)
  const allNames = new Set([...effectiveRegistry.keys(), ...BUILTIN_DOC_REGISTRY.keys(), ...onDisk])
  allNames.delete('manifest')

  // Read manifest
  const manifestResult = readManifest(docsDir)
  const manifest: Manifest = manifestResult.isOk() ? manifestResult.value : {}

  // Fetch remote Last-Modified headers in parallel (only for enabled docs in registry)
  const remoteHeaders = new Map<string, string | null>()
  if (check) {
    const checks = [...allNames]
      .filter((name) => !disabledNames.has(name) && effectiveRegistry.has(name))
      .map(async (name) => {
        const url = effectiveRegistry.get(name)
        if (!url) return
        const lastMod = await checkRemote(url)
        remoteHeaders.set(name, lastMod)
      })
    await Promise.all(checks)
  }

  // Build rows sorted alphabetically
  return [...allNames].toSorted().map((name) => {
    const entry = manifest[name]
    const isEnabled = !disabledNames.has(name)
    const isLoaded = onDisk.has(name)

    const fetched =
      isLoaded && entry?.fetchedAt
        ? formatDate(entry.fetchedAt)
        : isLoaded
          ? 'unknown'
          : '[not loaded]'

    const baseRow = [name, fetched, isEnabled ? 'yes' : 'no']

    if (!check) return baseRow

    const remoteLM = remoteHeaders.get(name)
    const localLM = entry?.lastModified

    if (!isEnabled || !effectiveRegistry.has(name)) {
      return [...baseRow, '\u2014', '\u2014']
    }
    if (!remoteLM) {
      return [...baseRow, '\u2014', '[unknown]']
    }

    const remote = formatHttpDate(remoteLM)
    let status: string
    if (!localLM) {
      status = isLoaded ? '[unknown]' : '\u2014'
    } else if (localLM === remoteLM) {
      status = '[current]'
    } else {
      status = '[outdated]'
    }

    return [...baseRow, remote, status]
  })
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

const renderTable = (headers: readonly string[], rows: readonly string[][]): string => {
  // Calculate column widths from headers and all rows
  const widths = headers.map((h, i) => {
    let max = h.length
    for (const row of rows) {
      const len = row[i]?.length ?? 0
      if (len > max) max = len
    }
    return max
  })

  const headerLine = headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join('  ')
  // eslint-disable-next-line effect/no-eta-expansion -- String#repeat needs a wrapper
  const separator = widths.map((w) => '\u2500'.repeat(w)).join('  ')
  const dataLines = rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  '))

  return [headerLine, separator, ...dataLines].join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async (): Promise<void> => {
  const cliArgs = process.argv.slice(2).filter((a) => a.trim() !== '')
  const check = cliArgs.includes('check')

  // Load config
  let config: PrimeClaudeConfig = {}
  const configResult = loadConfig()
  if (configResult.isErr()) {
    console.error(`Warning: Failed to load config: ${configResult.error.message}`)
  } else {
    config = configResult.value
  }

  const docsDir = resolveDocsDir()
  const hasDocFiles = existsSync(docsDir) && readdirSync(docsDir).some((f) => f.endsWith('.md'))

  if (!hasDocFiles && !check) {
    const registry = buildEffectiveRegistry(config)
    const available = [...registry.keys()].join(', ')
    console.log(
      `No documentation loaded. Run \`/prime-claude load\` to fetch docs.\nAvailable: ${available}`,
    )
    return
  }

  const rows = await buildRows(config, check)

  if (rows.length === 0) {
    console.log('No documents found.')
    return
  }

  const headers = check
    ? ['Document', 'Fetched', 'Enabled', 'Remote', 'Status']
    : ['Document', 'Fetched', 'Enabled']

  console.log(renderTable(headers, rows))
}

void main()
