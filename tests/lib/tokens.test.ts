import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/auth/config.js', () => ({
  persistTokens: vi.fn(),
}))

import { persistTokens } from '../../src/auth/config.js'
import { discoverAndPersistTokens } from '../../src/lib/tokens.js'

const mockedPersistTokens = vi.mocked(persistTokens)

function makeDiscovered(chain: string, contractAddress: string, ticker: string, decimals: number) {
  return { chain, contractAddress, ticker, decimals }
}

function makeMockVault(discoverMap: Record<string, ReturnType<typeof makeDiscovered>[]>, existingTokens: Record<string, Array<{ id: string; symbol: string; decimals: number; contractAddress: string }>>) {
  return {
    discoverTokens: vi.fn(async (chain: string) => {
      const result = discoverMap[chain]
      if (!result) throw new Error('discovery not supported')
      return result
    }),
    addToken: vi.fn(),
    getTokens: vi.fn((chain: string) =>
      (existingTokens[chain] ?? []).map((t) => ({ ...t, name: t.symbol, chainId: chain }))
    ),
  }
}

describe('discoverAndPersistTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('discovers and persists tokens across multiple chains', async () => {
    const vault = makeMockVault({
      Ethereum: [makeDiscovered('Ethereum', '0xusdc', 'USDC', 6)],
      Polygon: [makeDiscovered('Polygon', '0xdai', 'DAI', 18)],
    }, {})

    const results = await discoverAndPersistTokens(vault, 'v1', ['Ethereum', 'Polygon'])

    expect(results).toHaveLength(2)
    expect(results[0].chain).toBe('Ethereum')
    expect(results[0].symbol).toBe('USDC')
    expect(results[1].chain).toBe('Polygon')
    expect(results[1].symbol).toBe('DAI')
    expect(mockedPersistTokens).toHaveBeenCalledTimes(2)
  })

  it('adds discovered tokens to vault via addToken', async () => {
    const vault = makeMockVault({
      Ethereum: [makeDiscovered('Ethereum', '0xusdc', 'USDC', 6)],
    }, {})

    await discoverAndPersistTokens(vault, 'v1', ['Ethereum'])

    expect(vault.addToken).toHaveBeenCalledWith('Ethereum', expect.objectContaining({
      symbol: 'USDC',
      decimals: 6,
      contractAddress: '0xusdc',
    }))
  })

  it('skips chains that throw on discovery', async () => {
    const vault = makeMockVault({
      Ethereum: [makeDiscovered('Ethereum', '0xusdc', 'USDC', 6)],
      // Bitcoin not in map — will throw
    }, {})

    const results = await discoverAndPersistTokens(vault, 'v1', ['Bitcoin', 'Ethereum'])

    expect(results).toHaveLength(1)
    expect(results[0].chain).toBe('Ethereum')
  })

  it('returns empty array when all chains fail', async () => {
    const vault = makeMockVault({}, {})

    const results = await discoverAndPersistTokens(vault, 'v1', ['Bitcoin', 'Solana'])
    expect(results).toEqual([])
    expect(mockedPersistTokens).not.toHaveBeenCalled()
  })

  it('merges with existing tokens when mergeExisting is true', async () => {
    const vault = makeMockVault({
      Ethereum: [makeDiscovered('Ethereum', '0xnew', 'NEW', 18)],
    }, {
      Ethereum: [{ id: '0xold', symbol: 'OLD', decimals: 18, contractAddress: '0xold' }],
    })

    await discoverAndPersistTokens(vault, 'v1', ['Ethereum'], { mergeExisting: true })

    expect(mockedPersistTokens).toHaveBeenCalledWith('v1', 'Ethereum', expect.arrayContaining([
      expect.objectContaining({ symbol: 'OLD', contractAddress: '0xold' }),
      expect.objectContaining({ symbol: 'NEW', contractAddress: '0xnew' }),
    ]))
  })

  it('does not merge when mergeExisting is omitted', async () => {
    const vault = makeMockVault({
      Ethereum: [makeDiscovered('Ethereum', '0xnew', 'NEW', 18)],
    }, {
      Ethereum: [{ id: '0xold', symbol: 'OLD', decimals: 18, contractAddress: '0xold' }],
    })

    await discoverAndPersistTokens(vault, 'v1', ['Ethereum'])

    expect(mockedPersistTokens).toHaveBeenCalledWith('v1', 'Ethereum', [
      expect.objectContaining({ symbol: 'NEW', contractAddress: '0xnew' }),
    ])
  })
})
