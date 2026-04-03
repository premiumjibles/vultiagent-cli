import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { getTools } from './tools.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'))

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'vultisig',
    version: pkg.version,
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
  const toStderr = (...args: unknown[]) => {
    process.stderr.write(args.map(String).join(' ') + '\n')
  }
  console.log = toStderr
  console.info = toStderr
  console.warn = toStderr

  const server = createMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
