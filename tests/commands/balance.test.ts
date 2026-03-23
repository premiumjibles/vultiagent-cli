import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVault = vi.hoisted(() => ({
  id: 'vault-123',
  name: 'TestVault',
  balance: vi.fn(),
  balances: vi.fn(),
  balancesWithPrices: vi.fn(),
  chains: ['Ethereum', 'Bitcoin'],
  getTokens: vi.fn().mockReturnValue([]),
  discoverTokens: vi.fn().mockResolvedValue([]),
  addToken: vi.fn(),
}))

vi.mock('../../src/lib/sdk.js', () => ({
  withVault: vi.fn(async (fn) => fn({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
    vaultEntry: { id: 'vault-123', tokens: {} },
  })),
  suppressConsoleWarn: vi.fn(async (fn: () => unknown) => fn()),
}))

vi.mock('../../src/auth/config.js', () => ({
  persistTokens: vi.fn(),
}))

vi.mock('../../src/lib/tokens.js', () => ({
  discoverAndPersistTokens: vi.fn().mockResolvedValue([]),
}))

import { getBalances } from '../../src/commands/balance.js'

describe('balance command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVault.getTokens.mockReturnValue([])
    mockVault.chains = ['Ethereum', 'Bitcoin']
  })

  it('returns balances for all chains', async () => {
    mockVault.balances.mockResolvedValue({
      Ethereum: { chainId: 'Ethereum', symbol: 'ETH', amount: '1000000000000000000', formattedAmount: '1.0', decimals: 18 },
      Bitcoin: { chainId: 'Bitcoin', symbol: 'BTC', amount: '100000000', formattedAmount: '1.0', decimals: 8 },
    })

    const result = await getBalances({})
    expect(result).toHaveLength(2)
    expect(result[0].chain).toBe('Ethereum')
    expect(result[1].chain).toBe('Bitcoin')
  })

  it('filters by chain when specified', async () => {
    mockVault.balance.mockResolvedValue({
      chainId: 'Ethereum', symbol: 'ETH', amount: '1000000000000000000', formattedAmount: '1.0', decimals: 18,
    })

    const result = await getBalances({ chain: 'Ethereum' })
    expect(result).toHaveLength(1)
    expect(result[0].chain).toBe('Ethereum')
    expect(result[0].decimals).toBe(18)
  })

  it('returns balances with fiat values', async () => {
    mockVault.balancesWithPrices.mockResolvedValue({
      Ethereum: { chainId: 'Ethereum', symbol: 'ETH', amount: '1000000000000000000', formattedAmount: '1.0', decimals: 18, fiatValue: 2500.0, fiatCurrency: 'usd' },
    })

    const result = await getBalances({ fiat: true })
    expect(result).toHaveLength(2) // Ethereum + Bitcoin
    const eth = result.find((r) => r.symbol === 'ETH')!
    expect(eth.fiatValue).toBe(2500)
    expect(eth.fiatCurrency).toBe('USD')
  })

  it('falls back to balances without fiat when pricing fails for a chain', async () => {
    mockVault.chains = ['Ethereum', 'Solana']

    // Ethereum pricing works
    mockVault.balancesWithPrices.mockImplementation(async (chains: string[]) => {
      if (chains[0] === 'Solana') throw new Error('Token pricing not supported for Solana (non-EVM chain)')
      return {
        Ethereum: { chainId: 'Ethereum', symbol: 'ETH', amount: '1000000000000000000', formattedAmount: '1.0', decimals: 18, fiatValue: 2500.0, fiatCurrency: 'usd' },
      }
    })

    // Solana fallback returns balances without fiat
    mockVault.balances.mockResolvedValue({
      Solana: { chainId: 'Solana', symbol: 'SOL', amount: '1000000000', formattedAmount: '1.0', decimals: 9 },
      'Solana:PUMP': { chainId: 'Solana', symbol: 'PUMP', amount: '500000', formattedAmount: '500.0', decimals: 6 },
    })

    const result = await getBalances({ fiat: true, includeTokens: true })

    // ETH should have fiat values
    const eth = result.find((r) => r.symbol === 'ETH')!
    expect(eth.fiatValue).toBe(2500)
    expect(eth.fiatCurrency).toBe('USD')

    // SOL and PUMP should be present without fiat values but with decimals
    const sol = result.find((r) => r.symbol === 'SOL')!
    expect(sol.chain).toBe('Solana')
    expect(sol.amount).toBe('1.0')
    expect(sol.fiatValue).toBeUndefined()
    expect(sol.decimals).toBe(9)

    const pump = result.find((r) => r.symbol === 'PUMP')!
    expect(pump.chain).toBe('Solana')
    expect(pump.amount).toBe('500.0')
    expect(pump.fiatValue).toBeUndefined()
    expect(pump.decimals).toBe(6)
  })

  it('does not crash when all chains fail pricing', async () => {
    mockVault.balancesWithPrices.mockRejectedValue(new Error('pricing unavailable'))
    mockVault.balances.mockImplementation(async (chains: string[]) => ({
      [chains[0]]: { chainId: chains[0], symbol: chains[0] === 'Ethereum' ? 'ETH' : 'BTC', amount: '100', formattedAmount: '0.1', decimals: 18 },
    }))

    const result = await getBalances({ fiat: true })
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.fiatValue === undefined)).toBe(true)
  })
})
