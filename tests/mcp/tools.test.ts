import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVault = vi.hoisted(() => ({
  id: 'vault-123',
  name: 'TestVault',
  type: 'fast',
  isEncrypted: false,
  threshold: 2,
  totalSigners: 3,
  chains: ['Ethereum', 'Bitcoin'],
  balance: vi.fn(),
  balances: vi.fn(),
  balancesWithPrices: vi.fn(),
  address: vi.fn(),
  getTokens: vi.fn().mockReturnValue([]),
  discoverTokens: vi.fn().mockResolvedValue([]),
  addToken: vi.fn(),
  getSwapQuote: vi.fn(),
  getSupportedSwapChains: vi.fn(),
  prepareSendTx: vi.fn(),
  prepareSwapTx: vi.fn(),
  extractMessageHashes: vi.fn().mockResolvedValue(['0xhash1']),
  sign: vi.fn().mockResolvedValue({ signature: '0xsig' }),
  broadcastTx: vi.fn().mockResolvedValue('0xtxhash'),
  validateTransaction: vi.fn().mockResolvedValue(null),
  getMaxSendAmount: vi.fn(),
}))

vi.mock('../../src/lib/sdk.js', () => ({
  withVault: vi.fn(async (fn) => fn({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
    vaultEntry: { id: 'vault-123', name: 'TestVault', filePath: '/test.vult', tokens: {} },
  })),
  suppressConsoleWarn: vi.fn(async (fn: () => unknown) => fn()),
}))

vi.mock('../../src/auth/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    vaults: [{ id: 'vault-123', name: 'TestVault', filePath: '/test.vult' }],
  }),
  persistTokens: vi.fn(),
}))

vi.mock('../../src/lib/tokens.js', () => ({
  discoverAndPersistTokens: vi.fn().mockResolvedValue([]),
}))

vi.mock('@vultisig/sdk', () => ({
  Vultisig: { getTxExplorerUrl: vi.fn().mockReturnValue('https://etherscan.io/tx/0xtxhash') },
  SUPPORTED_CHAINS: ['Ethereum', 'Bitcoin', 'THORChain', 'Solana'],
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue('server-pw'),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))

import { getTools } from '../../src/mcp/tools.js'
import { UsageError } from '../../src/lib/errors.js'

describe('MCP tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVault.chains = ['Ethereum', 'Bitcoin']
  })

  describe('tool registration', () => {
    it('registers all 8 tools', () => {
      const tools = getTools()
      const names = Object.keys(tools)
      expect(names).toHaveLength(8)
      expect(names).toContain('get_balances')
      expect(names).toContain('get_portfolio')
      expect(names).toContain('get_address')
      expect(names).toContain('vault_info')
      expect(names).toContain('supported_chains')
      expect(names).toContain('swap_quote')
      expect(names).toContain('send')
      expect(names).toContain('swap')
    })

    it('each tool has description and inputSchema', () => {
      const tools = getTools()
      for (const [name, tool] of Object.entries(tools)) {
        expect(tool.description, `${name} missing description`).toBeTruthy()
        expect(tool.inputSchema._zod, `${name} should be a Zod schema`).toBeDefined()
      }
    })
  })

  describe('get_balances handler', () => {
    it('returns formatted balance data', async () => {
      mockVault.balances.mockResolvedValue({
        Ethereum: { chainId: 'Ethereum', symbol: 'ETH', amount: '1000000000000000000', formattedAmount: '1.0', decimals: 18 },
      })

      const tools = getTools()
      const result = await tools.get_balances.handler({})

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data).toBeInstanceOf(Array)
      expect(data[0].chain).toBe('Ethereum')
      expect(data[0].symbol).toBe('ETH')
    })
  })

  describe('get_portfolio handler', () => {
    it('returns balances with fiat values', async () => {
      mockVault.balancesWithPrices.mockResolvedValue({
        Ethereum: { chainId: 'Ethereum', symbol: 'ETH', amount: '1000000000000000000', formattedAmount: '1.0', decimals: 18, fiatValue: 2500.0 },
      })

      const tools = getTools()
      const result = await tools.get_portfolio.handler({})

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data[0].fiatValue).toBe(2500)
      expect(data[0].fiatCurrency).toBe('USD')
    })
  })

  describe('get_address handler', () => {
    it('returns address for a chain', async () => {
      mockVault.address.mockResolvedValue('0xAbC123')

      const tools = getTools()
      const result = await tools.get_address.handler({ chain: 'Ethereum' })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data.chain).toBe('Ethereum')
      expect(data.address).toBe('0xAbC123')
    })
  })

  describe('vault_info handler', () => {
    it('returns vault metadata', async () => {
      const tools = getTools()
      const result = await tools.vault_info.handler({})

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data.id).toBe('vault-123')
      expect(data.name).toBe('TestVault')
      expect(data.chains).toEqual(['Ethereum', 'Bitcoin'])
    })
  })

  describe('supported_chains handler', () => {
    it('returns chain list', async () => {
      mockVault.getSupportedSwapChains.mockResolvedValue(['Ethereum', 'Bitcoin', 'THORChain'])

      const tools = getTools()
      const result = await tools.supported_chains.handler({})

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data).toEqual(['Ethereum', 'Bitcoin', 'THORChain'])
    })
  })

  describe('swap_quote handler', () => {
    it('returns formatted quote', async () => {
      mockVault.getSwapQuote.mockResolvedValue({
        fromCoin: { chain: 'Ethereum', ticker: 'ETH', decimals: 18 },
        toCoin: { chain: 'Bitcoin', ticker: 'BTC', decimals: 8 },
        estimatedOutput: 5000000n,
        estimatedOutputFiat: 2500.0,
        provider: 'thorchain',
        warnings: [],
        requiresApproval: false,
      })

      const tools = getTools()
      const result = await tools.swap_quote.handler({ from: 'Ethereum', to: 'Bitcoin', amount: '1.0' })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data.fromToken).toBe('ETH')
      expect(data.toToken).toBe('BTC')
      expect(data.estimatedOutput).toBe('0.05')
      expect(data.provider).toBe('thorchain')
    })
  })

  describe('send confirmation flow', () => {
    beforeEach(() => {
      mockVault.address.mockResolvedValue('0xSenderAddress')
      mockVault.balance.mockResolvedValue({
        decimals: 18, symbol: 'ETH', chain: 'Ethereum',
        amount: '10000000000000000000', formattedAmount: '10.0',
      })
      mockVault.prepareSendTx.mockResolvedValue({ coin: { chain: 'Ethereum' } })
      mockVault.broadcastTx.mockResolvedValue('0xtxhash123')
    })

    it('send with confirmed=false returns preview (dryRun)', async () => {
      const tools = getTools()
      const result = await tools.send.handler({
        chain: 'Ethereum', to: '0xRecipient', amount: '1.0', confirmed: false,
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data.dryRun).toBe(true)
      expect(data.chain).toBe('Ethereum')
      expect(data.to).toBe('0xRecipient')
      expect(data.amount).toBe('1.0')
      expect(mockVault.sign).not.toHaveBeenCalled()
    })

    it('send with confirmed=true executes and returns txHash', async () => {
      const tools = getTools()
      const result = await tools.send.handler({
        chain: 'Ethereum', to: '0xRecipient', amount: '1.0', confirmed: true,
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data.txHash).toBe('0xtxhash123')
      expect(data.chain).toBe('Ethereum')
    })
  })

  describe('swap confirmation flow', () => {
    beforeEach(() => {
      mockVault.getSwapQuote.mockResolvedValue({
        fromCoin: { chain: 'Ethereum', ticker: 'ETH', decimals: 18 },
        toCoin: { chain: 'Bitcoin', ticker: 'BTC', decimals: 8 },
        estimatedOutput: 5000000n,
        estimatedOutputFiat: 2500.0,
        provider: 'thorchain',
        warnings: [],
        requiresApproval: false,
      })
      mockVault.prepareSwapTx.mockResolvedValue({
        keysignPayload: { coin: { chain: 'Ethereum' } },
        approvalPayload: null,
      })
      mockVault.broadcastTx.mockResolvedValue('0xswaptx')
    })

    it('swap with confirmed=false returns quote preview', async () => {
      const tools = getTools()
      const result = await tools.swap.handler({
        from: 'Ethereum', to: 'Bitcoin', amount: '1.0', confirmed: false,
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data.dryRun).toBe(true)
      expect(data.fromToken).toBe('ETH')
      expect(data.toToken).toBe('BTC')
      expect(data.estimatedOutput).toBe('0.05')
      expect(mockVault.sign).not.toHaveBeenCalled()
    })

    it('swap with confirmed=true executes swap', async () => {
      const tools = getTools()
      const result = await tools.swap.handler({
        from: 'Ethereum', to: 'Bitcoin', amount: '1.0', confirmed: true,
      })

      expect(result.isError).toBeFalsy()
      const data = JSON.parse(result.content[0].text)
      expect(data.txHash).toBe('0xswaptx')
      expect(data.chain).toBe('Ethereum')
    })
  })

  describe('error handling', () => {
    it('wraps VasigError with code and hint', async () => {
      mockVault.balances.mockRejectedValue(new UsageError('bad input', 'try again'))

      const tools = getTools()
      const result = await tools.get_balances.handler({})

      expect(result.isError).toBe(true)
      const data = JSON.parse(result.content[0].text)
      expect(data.error).toBe('bad input')
      expect(data.hint).toBe('try again')
    })

    it('classifies generic Error via classifyError', async () => {
      mockVault.balances.mockRejectedValue(new Error('unsupported chain XYZ'))

      const tools = getTools()
      const result = await tools.get_balances.handler({})

      expect(result.isError).toBe(true)
      const data = JSON.parse(result.content[0].text)
      expect(data.error).toBeTruthy()
    })

    it('handles non-Error throw with String() fallback', async () => {
      mockVault.balances.mockRejectedValue('unexpected string error')

      const tools = getTools()
      const result = await tools.get_balances.handler({})

      expect(result.isError).toBe(true)
      const data = JSON.parse(result.content[0].text)
      expect(data.error).toBeTruthy()
    })
  })

  describe('get_address not-found', () => {
    it('returns isError when chain is not in vault', async () => {
      mockVault.address.mockResolvedValue('0xAbC123')

      const tools = getTools()
      const result = await tools.get_address.handler({ chain: 'Solana' })

      expect(result.isError).toBe(true)
      const data = JSON.parse(result.content[0].text)
      expect(data.error).toBeTruthy()
      expect(data.hint).toBeTruthy()
    })
  })
})
