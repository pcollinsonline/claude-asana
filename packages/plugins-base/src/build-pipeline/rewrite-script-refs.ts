// ---------------------------------------------------------------------------
// Markdown script reference rewriting
//
// Rewrites TypeScript source paths in markdown to point at the bundled JS
// output under ${CLAUDE_PLUGIN_ROOT}/dist/. Handles two cases:
//   1. Command blocks: !\`src/skills/foo/bar.ts\` → !\`node ${CLAUDE_PLUGIN_ROOT}/dist/skills/foo/bar.js $ARGUMENTS\`
//   2. Bare paths in prose: src/skills/foo/bar.ts → ${CLAUDE_PLUGIN_ROOT}/dist/skills/foo/bar.js
// ---------------------------------------------------------------------------

/**
 * Rewrite script references in markdown content for a given component.
 *
 * @param content        - raw markdown string
 * @param componentType  - 'skills' or 'agents'
 * @param componentName  - the skill or agent name (used in path matching)
 * @returns markdown with TypeScript source paths replaced by bundled JS paths
 */
export const rewriteScriptRefs = (
  content: string,
  componentType: 'agents' | 'skills',
  componentName: string,
): string => {
  // Match command blocks: !\`[optional env vars] src/<type>/<name>/<script>.ts [...]\`
  // Captures any env-var assignments before the script path (e.g. `VAR=value VAR2=value`)
  // so they are preserved in the rewritten command.
  const cmdPattern = new RegExp(
    String.raw`!\x60((?:[A-Z_][A-Z0-9_]*=\S+\s+)*)[^\x60]*\bsrc/${componentType}/${componentName}/([a-zA-Z0-9_/-]+)\.ts\b[^\x60]*\x60`,
    'g',
  )
  let result = content.replaceAll(
    cmdPattern,
    `!\`$1node \${CLAUDE_PLUGIN_ROOT}/dist/${componentType}/${componentName}/$2.js $ARGUMENTS\``,
  )

  // Match bare path references in prose (not inside command blocks)
  const barePattern = new RegExp(
    String.raw`\bsrc/${componentType}/${componentName}/([a-zA-Z0-9_/-]+)\.ts\b`,
    'g',
  )
  result = result.replaceAll(
    barePattern,
    `\${CLAUDE_PLUGIN_ROOT}/dist/${componentType}/${componentName}/$1.js`,
  )

  return result
}
