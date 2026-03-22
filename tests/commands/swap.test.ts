import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVault = vi.hoisted(() => ({
  id: 'vault-123',
  name: 'TestVault',
  isEncrypted: false,
  getSwapQuote: vi.fn().mockResolvedValue({
    fromCoin: { chain: 'Ethereum', ticker: 'ETH', decimals: 18 },
    toCoin: { chain: 'Bitcoin', ticker: 'BTC', decimals: 8 },
    estimatedOutput: '0.05',
    provider: 'thorchain',
  }),
  getSupportedSwapChains: vi.fn().mockResolvedValue(['Ethereum', 'Bitcoin', 'THORChain']),
  isSwapSupported: vi.fn().mockResolvedValue(true),
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
  createSdkWithVault: vi.fn().mockResolvedValue({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
  }),
}))

vi.mock('@vultisig/sdk', () => ({
  Vultisig: { getTxExplorerUrl: vi.fn().mockReturnValue('https://etherscan.io/tx/0xswaptx') },
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue('server-pw'),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))

import { getSwapQuote, getSupportedChains, executeSwap } from '../../src/commands/swap.js'

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
