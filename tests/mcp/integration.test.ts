import { spawn, ChildProcess } from 'node:child_process'
import { test, expect } from 'vitest'

function sendMessage(proc: ChildProcess, message: object): void {
  const json = JSON.stringify(message) + '\n'
  proc.stdin!.write(json)
}

function readMessage(proc: ChildProcess): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for response')), 10000)

    const onData = (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter((l) => l.trim())
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          clearTimeout(timeout)
          proc.stdout!.off('data', onData)
          resolve(parsed)
          return
        } catch {
          // not valid JSON yet, keep buffering
        }
      }
    }

    proc.stdout!.on('data', onData)
  })
}

test('MCP server responds to initialize and tools/list over stdio', async () => {
  const proc = spawn('npx', ['tsx', 'src/mcp/start.ts'], {
    cwd: '/home/sean/Repos/vultisig/vultiagent-cli',
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  try {
    // Wait briefly for server to start
    await new Promise((r) => setTimeout(r, 1000))

    // Send initialize request
    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    })

    const initResponse = await readMessage(proc)
    expect(initResponse.jsonrpc).toBe('2.0')
    expect(initResponse.id).toBe(1)
    const initResult = initResponse.result as Record<string, unknown>
    const serverInfo = initResult.serverInfo as Record<string, string>
    expect(serverInfo.name).toBe('vultisig')

    // Send initialized notification
    sendMessage(proc, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })

    // Send tools/list request
    sendMessage(proc, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })

    const toolsResponse = await readMessage(proc)
    expect(toolsResponse.id).toBe(2)
    const toolsResult = toolsResponse.result as Record<string, unknown>
    const tools = toolsResult.tools as Array<{ name: string }>
    expect(tools).toHaveLength(8)

    const toolNames = tools.map((t) => t.name).sort()
    expect(toolNames).toEqual([
      'get_address',
      'get_balances',
      'get_portfolio',
      'send',
      'supported_chains',
      'swap',
      'swap_quote',
      'vault_info',
    ])
  } finally {
    proc.kill()
  }
}, 15000)
