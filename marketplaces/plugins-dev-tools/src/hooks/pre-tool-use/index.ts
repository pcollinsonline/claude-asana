import type { PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk'

import { parseHookInput, readStdin } from '@packages/plugins-base'

/**
 * Auto-approve this plugin's own MCP tools.
 *
 * This hook auto-approves MCP tools for direct skill invocations (e.g. `/commit`).
 * However, `permissionDecision` from PreToolUse hooks is silently ignored in
 * subagent context (e.g. commit-agent spawned by ship-it) — Claude Code's
 * security boundary prevents plugins from auto-approving their own tools in
 * subagents. For subagent contexts, MCP tools must be listed in
 * `.claude/settings.json` `permissions.allow`.
 */
const MCP_PREFIX = 'mcp__plugin_plugins-dev-tools_dev-tools__'

/**
 * Matches `git` followed by any flags/options before a subcommand,
 * specifically looking for `-C` (change directory).
 * Covers `git -C <path> ...` and `git -C<path> ...` (no space).
 */
const GIT_DASH_C_PATTERN = /\bgit\s+-C\b/

const approve = (toolName: string): void => {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: `Auto-approved plugin MCP tool: ${toolName}`,
      },
    }),
  )
}

const deny = (reason: string): void => {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  )
}

const passthrough = (): void => {
  console.log(JSON.stringify({}))
}

const main = async (): Promise<void> => {
  const result = await readStdin().andThen(parseHookInput<PreToolUseHookInput>)

  if (result.isErr()) {
    console.error(`Pre tool use hook error: ${result.error.message}`)
    passthrough()
    return
  }

  const { tool_input, tool_name } = result.value

  if (tool_name.startsWith(MCP_PREFIX)) {
    approve(tool_name)
    return
  }

  const command = (tool_input as { command?: string }).command ?? ''

  if (GIT_DASH_C_PATTERN.test(command)) {
    deny(
      'Do not use `git -C`. Git commands already operate on the full repository from any subdirectory. Use absolute paths for file arguments instead.',
    )
    return
  }

  passthrough()
}

void main()
