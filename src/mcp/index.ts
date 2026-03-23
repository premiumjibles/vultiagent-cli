import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { getTools } from './tools.js'

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'vultisig',
    version: '0.1.0',
  })

  const tools = getTools()

  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(name, {
      description: tool.description,
      inputSchema: tool.inputSchema,
    }, async (args) => tool.handler(args))
  }

  return server
}

export async function startMcpServer(): Promise<void> {
  // MCP stdio requires stdout exclusively for JSON-RPC.
  // Redirect any console.log to stderr to prevent protocol corruption.
  console.log = (...args: unknown[]) => {
    console.error('[mcp:log]', ...args)
  }

  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
