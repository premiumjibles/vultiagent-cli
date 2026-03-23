import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRegisterTool = vi.hoisted(() => vi.fn())
const mockConnect = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: mockRegisterTool,
    connect: mockConnect,
  })),
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}))

// Mock all command modules to avoid SDK initialization
vi.mock('../../src/commands/balance.js', () => ({ getBalances: vi.fn() }))
vi.mock('../../src/commands/addresses.js', () => ({ getAddresses: vi.fn() }))
vi.mock('../../src/commands/vault.js', () => ({ getVaultInfo: vi.fn() }))
vi.mock('../../src/commands/swap.js', () => ({ getSwapQuote: vi.fn(), getSupportedChains: vi.fn(), executeSwap: vi.fn() }))
vi.mock('../../src/commands/send.js', () => ({ executeSend: vi.fn() }))

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

describe('createMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates server with name vultisig', async () => {
    const { createMcpServer } = await import('../../src/mcp/index.js')
    createMcpServer()
    expect(McpServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'vultisig' }),
    )
  })

  it('registers all 8 tools via registerTool()', async () => {
    const { createMcpServer } = await import('../../src/mcp/index.js')
    createMcpServer()
    expect(mockRegisterTool).toHaveBeenCalledTimes(8)
  })

  it('registers tools with expected names', async () => {
    const { createMcpServer } = await import('../../src/mcp/index.js')
    createMcpServer()

    const registeredNames = mockRegisterTool.mock.calls.map((call: unknown[]) => call[0])
    const expectedNames = [
      'get_balances', 'get_portfolio', 'get_address',
      'vault_info', 'supported_chains', 'swap_quote',
      'send', 'swap',
    ]
    expect(registeredNames.sort()).toEqual(expectedNames.sort())
  })

  it('passes config with description for each tool', async () => {
    const { createMcpServer } = await import('../../src/mcp/index.js')
    createMcpServer()

    for (const call of mockRegisterTool.mock.calls) {
      const config = call[1] as { description: string }
      expect(typeof config.description).toBe('string')
      expect(config.description.length).toBeGreaterThan(0)
    }
  })
})
