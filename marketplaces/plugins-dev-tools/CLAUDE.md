# plugins-dev-tools

## Gotchas

### Skill ↔ Agent tool sync

- **Rule**: When you change a skill's `allowed-tools` frontmatter, check whether an agent wraps that skill. If so, the agent's `tools` must be a **superset** of the skill's `allowed-tools`. The skill declares intent; the agent enforces permissions at runtime — a tool missing from the agent will be blocked even if the skill lists it.

- **Where to look**: Agent definitions live in `agents/<agent-name>.md`. An agent references skills via the `skills:` frontmatter field (`plugins-dev-tools:<skill-name>` namespace). An agent may preload multiple skills, so its `tools` must cover all of them combined.

- **Example**:

  Skill (`skills/my-skill/SKILL.md`):
  ```yaml
  allowed-tools: Bash(git log:*), Read
  ```

  Agent that preloads it (`agents/my-agent.md`) — must include those tools plus any extras it needs:
  ```yaml
  tools: Bash(git log:*), Bash(git diff:*), Read
  skills:
    - plugins-dev-tools:my-skill
  ```

### MCP tool permissions — two layers required

- **Direct invocations** (e.g. `/commit`): The plugin-level `PreToolUse` hook (`src/hooks/pre-tool-use/index.ts`) auto-approves MCP tools by prefix. New tools are automatically covered.
- **Subagent invocations** (e.g. `commit-agent` spawned by `ship-it`): PreToolUse hook `permissionDecision` is silently ignored in subagent context. MCP tools must be listed in `.claude/settings.json` `permissions.allow` to avoid prompts.
- **When adding a new MCP tool**: add it to both the MCP server AND `.claude/settings.json` `permissions.allow`.
