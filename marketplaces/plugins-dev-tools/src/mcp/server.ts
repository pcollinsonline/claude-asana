import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { execSync } from 'node:child_process'
import { z } from 'zod'

import { registerCommitTools } from './tools/commit.js'
import { registerIssueTools } from './tools/issue.js'
import { registerPlanTools } from './tools/plan.js'
import { registerPluginsDocTools } from './tools/plugins-doc.js'
import { registerPrTools } from './tools/pr.js'
import { registerReadmeTools } from './tools/readme.js'
import { registerShipTools } from './tools/ship.js'

// stdout is the JSON-RPC transport — all diagnostics must go to stderr
console.log = console.error

const server = new McpServer({ name: 'dev-tools', version: '0.0.1' })

server.registerTool(
  'echo',
  { description: 'Echo back the input message', inputSchema: { message: z.string() } },
  ({ message }) => ({
    content: [{ text: message, type: 'text' }],
  }),
)

server.registerTool('repo_info', { description: 'Return the git repository root path' }, () => {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return { content: [{ text: root, type: 'text' }] }
  } catch (error) {
    return {
      content: [
        { text: `Error: ${error instanceof Error ? error.message : String(error)}`, type: 'text' },
      ],
      isError: true,
    }
  }
})

registerCommitTools(server)
registerIssueTools(server)
registerPlanTools(server)
registerPluginsDocTools(server)
registerPrTools(server)
registerReadmeTools(server)
registerShipTools(server)

const main = async (): Promise<void> => {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

void main()
