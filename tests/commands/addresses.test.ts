import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVault = vi.hoisted(() => ({
  id: 'vault-123',
  name: 'TestVault',
  address: vi.fn(),
  chains: ['Ethereum', 'Bitcoin'],
}))

vi.mock('../../src/lib/sdk.js', () => ({
  withVault: vi.fn(async (fn) => fn({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
    vaultEntry: { id: 'vault-123', name: 'TestVault', filePath: '/test.vult' },
  })),
}))

import { getAddresses } from '../../src/commands/addresses.js'

describe('addresses command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVault.address.mockImplementation(async (chain: string) => {
      if (chain === 'Ethereum') return '0xabc123'
      if (chain === 'Bitcoin') return 'bc1qxyz'
      return 'unknown'
    })
  })

  it('returns addresses for all chains', async () => {
    const result = await getAddresses()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ chain: 'Ethereum', address: '0xabc123' })
    expect(result[1]).toEqual({ chain: 'Bitcoin', address: 'bc1qxyz' })
  })
})
