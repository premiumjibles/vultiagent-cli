import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVault = vi.hoisted(() => ({
  id: 'vault-123',
  name: 'TestVault',
  balance: vi.fn(),
  balances: vi.fn(),
  chains: ['Ethereum', 'Bitcoin'],
}))

vi.mock('../../src/lib/sdk.js', () => ({
  createSdkWithVault: vi.fn().mockResolvedValue({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
  }),
}))

import { getBalances } from '../../src/commands/balance.js'

describe('balance command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })
})
