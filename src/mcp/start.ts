import { startMcpServer } from './index.js'

startMcpServer().catch((err) => {
  console.error('MCP server failed to start:', err)
  process.exit(1)
})
