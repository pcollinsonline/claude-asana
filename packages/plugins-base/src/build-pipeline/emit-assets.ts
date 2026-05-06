// ---------------------------------------------------------------------------
// Asset emission — all post-build filesystem writes
//
// Writes manifests, hooks.json files, skill/agent markdown (with script
// reference rewriting), and MCP configuration. Called after esbuild
// bundling completes.
// ---------------------------------------------------------------------------

import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { PluginBuildConfig, PluginBuildPlan } from './types.js'

import { collectMarkdownFiles, toPascalCase } from './discover.js'
import { rewriteScriptRefs } from './rewrite-script-refs.js'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Emit all non-esbuild build artifacts: manifests, hooks.json, skill/agent
 * markdown, and MCP configuration.
 *
 * This function assumes the distDir already exists and esbuild has
 * written bundled JS to distDir/dist/.
 */
export const emitAssets = (plan: PluginBuildPlan, config: PluginBuildConfig): void => {
  const { distDir, hookAsync = {}, hookFlags = {}, hookMatchers = {} } = config

  // -------------------------------------------------------------------------
  // Plugin manifest — .claude-plugin/plugin.json
  // -------------------------------------------------------------------------

  const pluginManifest = {
    description: plan.pkg.description,
    license: plan.pkg.license,
    name: plan.pkg.name,
    version: plan.pkg.version,
  }

  const manifestDir = path.join(distDir, '.claude-plugin')
  mkdirSync(manifestDir, { recursive: true })
  writeFileSync(
    path.join(manifestDir, 'plugin.json'),
    JSON.stringify(pluginManifest, null, 2) + '\n',
  )
  console.log('  \u2713 plugin.json manifest')

  // -------------------------------------------------------------------------
  // hooks.json — plugin-level hook configuration
  // -------------------------------------------------------------------------

  if (plan.hookDirs.length > 0) {
    interface HookEntry {
      hooks: { async?: boolean; command: string; type: 'command' }[]
      matcher?: string
    }

    interface HookConfig {
      hooks: Record<string, HookEntry[]>
    }

    const hooksConfig: HookConfig = {
      hooks: Object.fromEntries(
        plan.hookDirs.map((name) => {
          const flags = hookFlags[name] ? ` ${hookFlags[name]}` : ''
          const matcher = hookMatchers[name]
          const eventName = toPascalCase(name)
          return [
            eventName,
            [
              {
                ...(matcher && { matcher }),
                hooks: [
                  {
                    ...(hookAsync[name] && { async: true }),
                    command: `node \${CLAUDE_PLUGIN_ROOT}/dist/hooks/${name}.js${flags}`,
                    type: 'command' as const,
                  },
                ],
              },
            ],
          ]
        }),
      ),
    }

    const hooksDir = path.join(distDir, 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    writeFileSync(path.join(hooksDir, 'hooks.json'), JSON.stringify(hooksConfig, null, 2) + '\n')
    console.log('  \u2713 hooks/hooks.json')
  }

  // -------------------------------------------------------------------------
  // Skills — copy markdown, rewrite script refs, generate skill hooks.json
  // -------------------------------------------------------------------------

  const skillsDir = path.join(distDir, 'skills')

  for (const skill of plan.skills) {
    const dstDir = path.join(skillsDir, skill.name)
    const hasBundledCode = skill.scripts.length > 0 || skill.hooks.length > 0

    if (hasBundledCode) {
      mkdirSync(dstDir, { recursive: true })

      // Copy and rewrite markdown files
      const mdFiles = collectMarkdownFiles(skill.srcDir)
      for (const mdFile of mdFiles) {
        const relPath = path.relative(skill.srcDir, mdFile)
        const content = readFileSync(mdFile, 'utf8')
        const rewritten = rewriteScriptRefs(content, 'skills', skill.name)
        const dstFile = path.join(dstDir, relPath)
        mkdirSync(path.dirname(dstFile), { recursive: true })
        writeFileSync(dstFile, rewritten)
      }

      // Copy non-markdown directories alongside SKILL.md (templates, images, etc.)
      for (const entry of readdirSync(skill.srcDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const src = path.join(skill.srcDir, entry.name)
          cpSync(src, path.join(dstDir, entry.name), { recursive: true })
        }
      }

      // Generate skill-scoped hooks.json if the skill declares hooks
      if (skill.hooks.length > 0) {
        interface HookConfig {
          hooks: Record<string, { hooks: { command: string; type: 'command' }[] }[]>
        }

        const skillHooksConfig: HookConfig = {
          hooks: Object.fromEntries(
            skill.hooks.map((h) => [
              h.eventName,
              [
                {
                  hooks: [
                    {
                      command: `node \${CLAUDE_PLUGIN_ROOT}/dist/skills/${skill.name}/hooks/${h.kebabName}.js`,
                      type: 'command' as const,
                    },
                  ],
                },
              ],
            ]),
          ),
        }

        const skillHooksDir = path.join(dstDir, 'hooks')
        mkdirSync(skillHooksDir, { recursive: true })
        writeFileSync(
          path.join(skillHooksDir, 'hooks.json'),
          JSON.stringify(skillHooksConfig, null, 2) + '\n',
        )
      }
    } else {
      // Static skill — copy entire directory as-is
      cpSync(skill.srcDir, dstDir, { recursive: true })
    }

    console.log(`  \u2713 skills/${skill.name}/`)
  }

  // -------------------------------------------------------------------------
  // Agents — copy markdown, rewrite script references if needed
  // -------------------------------------------------------------------------

  if (plan.agents.length > 0) {
    const agentsDir = path.join(distDir, 'agents')
    mkdirSync(agentsDir, { recursive: true })

    for (const agent of plan.agents) {
      const content = readFileSync(agent.srcPath, 'utf8')
      const dstFile = path.join(agentsDir, `${agent.name}.md`)

      if (agent.scripts.length > 0) {
        const rewritten = rewriteScriptRefs(content, 'agents', agent.name)
        writeFileSync(dstFile, rewritten)
      } else {
        writeFileSync(dstFile, content)
      }

      console.log(`  \u2713 agents/${agent.name}.md`)
    }
  }

  // -------------------------------------------------------------------------
  // MCP — .mcp.json configuration (when mcp config is provided)
  // -------------------------------------------------------------------------

  const { mcp } = config
  if (mcp) {
    const mcpManifest = {
      mcpServers: {
        [mcp.name]: {
          args: ['${CLAUDE_PLUGIN_ROOT}/dist/mcp/server.js'],
          command: 'node',
        },
      },
    }

    writeFileSync(path.join(distDir, '.mcp.json'), JSON.stringify(mcpManifest, null, 2) + '\n')
    console.log('  \u2713 MCP server config (.mcp.json)')
  }
}
