import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVault = vi.hoisted(() => ({
  id: 'vault-123',
  name: 'TestVault',
  isEncrypted: false,
  getSwapQuote: vi.fn().mockResolvedValue({
    fromCoin: { chain: 'Ethereum', ticker: 'ETH', decimals: 18 },
    toCoin: { chain: 'Bitcoin', ticker: 'BTC', decimals: 8 },
    estimatedOutput: 5000000n,
    estimatedOutputFiat: 2500.0,
    provider: 'thorchain',
    warnings: [],
    requiresApproval: false,
  }),
  getSupportedSwapChains: vi.fn().mockResolvedValue(['Ethereum', 'Bitcoin', 'THORChain']),
  isSwapSupported: vi.fn().mockResolvedValue(true),
  validateTransaction: vi.fn().mockResolvedValue(null),
  prepareSwapTx: vi.fn().mockResolvedValue({
    keysignPayload: { coin: { chain: 'Ethereum' } },
    approvalPayload: null,
  }),
  extractMessageHashes: vi.fn().mockResolvedValue(['0xhash1']),
  sign: vi.fn().mockResolvedValue({ signature: '0xsig' }),
  broadcastTx: vi.fn().mockResolvedValue('0xswaptx'),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  isUnlocked: vi.fn().mockReturnValue(true),
}))

vi.mock('../../src/lib/sdk.js', () => ({
  withVault: vi.fn(async (fn) => fn({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
    vaultEntry: { id: 'vault-123', name: 'TestVault', filePath: '/test.vult' },
  })),
}))

vi.mock('@vultisig/sdk', () => ({
  Vultisig: { getTxExplorerUrl: vi.fn().mockReturnValue('https://etherscan.io/tx/0xswaptx') },
  SUPPORTED_CHAINS: ['Ethereum', 'Bitcoin', 'THORChain', 'Solana', 'Arbitrum', 'BSC', 'Avalanche', 'Base', 'Optimism', 'Polygon'],
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue('server-pw'),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))

import { getSwapQuote, getSupportedChains, executeSwap, formatAmount, mapQuoteResult } from '../../src/commands/swap.js'

describe('swap commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('swap-quote', () => {
    it('returns a swap quote', async () => {
      const result = await getSwapQuote({
        from: 'Ethereum',
        to: 'Bitcoin',
        amount: '1.0',
      })

      expect(result.fromToken).toBe('ETH')
      expect(result.toToken).toBe('BTC')
      expect(result.estimatedOutput).toBe('0.05')
      expect(result.estimatedOutputFiat).toBe(2500)
      expect(result.provider).toBe('thorchain')
    })
  })

  describe('swap-chains', () => {
    it('returns supported swap chains', async () => {
      const result = await getSupportedChains()
      expect(result).toEqual(['Ethereum', 'Bitcoin', 'THORChain'])
    })
  })

  describe('swap', () => {
    it('executes a swap with --yes flag', async () => {
      const result = await executeSwap({
        from: 'Ethereum',
        to: 'Bitcoin',
        amount: '1.0',
        yes: true,
      })

      expect(result.txHash).toBe('0xswaptx')
      expect(mockVault.getSwapQuote).toHaveBeenCalled()
      expect(mockVault.prepareSwapTx).toHaveBeenCalled()
      expect(mockVault.sign).toHaveBeenCalled()
      expect(mockVault.broadcastTx).toHaveBeenCalled()
    })
  })
})

describe('formatAmount', () => {
  it('formats whole numbers without fractional part', () => {
    expect(formatAmount(1000000000000000000n, 18)).toBe('1')
  })

  it('strips trailing zeros', () => {
    expect(formatAmount(1500000000000000000n, 18)).toBe('1.5')
  })

  it('handles zero', () => {
    expect(formatAmount(0n, 18)).toBe('0')
  })

  it('formats small amounts', () => {
    expect(formatAmount(1n, 8)).toBe('0.00000001')
  })

  it('handles decimals=0', () => {
    expect(formatAmount(42n, 0)).toBe('42')
  })
})

describe('mapQuoteResult', () => {
  const baseQuote = {
    fromCoin: { chain: 'Ethereum', ticker: 'ETH' },
    toCoin: { chain: 'Bitcoin', ticker: 'BTC', decimals: 8 },
    estimatedOutput: 5000000n,
    provider: 'thorchain',
    warnings: [] as string[],
  }

  it('maps all required fields from quote', () => {
    const result = mapQuoteResult(baseQuote, '1.0')
    expect(result.fromChain).toBe('Ethereum')
    expect(result.fromToken).toBe('ETH')
    expect(result.toChain).toBe('Bitcoin')
    expect(result.toToken).toBe('BTC')
    expect(result.inputAmount).toBe('1.0')
    expect(result.estimatedOutput).toBe('0.05')
    expect(result.provider).toBe('thorchain')
  })

  it('includes estimatedOutputFiat rounded to 2dp when present', () => {
    const result = mapQuoteResult({ ...baseQuote, estimatedOutputFiat: 2500.456 }, '1.0')
    expect(result.estimatedOutputFiat).toBe(2500.46)
  })

  it('omits estimatedOutputFiat when null', () => {
    const result = mapQuoteResult({ ...baseQuote, estimatedOutputFiat: null }, '1.0')
    expect(result.estimatedOutputFiat).toBeUndefined()
  })

  it('includes requiresApproval when true', () => {
    const result = mapQuoteResult({ ...baseQuote, requiresApproval: true }, '1.0')
    expect(result.requiresApproval).toBe(true)
  })

  it('copies warnings when non-empty', () => {
    const result = mapQuoteResult({ ...baseQuote, warnings: ['slippage high'] }, '1.0')
    expect(result.warnings).toEqual(['slippage high'])
  })

  it('omits warnings when empty', () => {
    const result = mapQuoteResult(baseQuote, '1.0')
    expect(result.warnings).toBeUndefined()
  })
})
