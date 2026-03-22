import type { DiscoveredToken, Token } from '@vultisig/sdk'
import { persistTokens } from '../auth/config.js'
import type { PersistedToken } from '../auth/config.js'

export function toToken(discovered: DiscoveredToken): Token {
  return {
    id: discovered.contractAddress,
    symbol: discovered.ticker,
    name: discovered.ticker,
    decimals: discovered.decimals,
    contractAddress: discovered.contractAddress,
    chainId: discovered.chain,
  }
}

export interface DiscoveryResult {
  chain: string
  contractAddress: string
  symbol: string
  decimals: number
}

interface DiscoverableVault {
  discoverTokens(chain: string): Promise<DiscoveredToken[]>
  addToken(chain: string, token: Token): Promise<void>
  getTokens(chain: string): Token[]
}

export async function discoverAndPersistTokens(
  vault: DiscoverableVault,
  vaultId: string,
  chains: string[],
  opts?: { mergeExisting?: boolean },
): Promise<DiscoveryResult[]> {
  const allDiscovered: DiscoveryResult[] = []

  for (const chain of chains) {
    try {
      const discovered = await vault.discoverTokens(chain)
      const chainTokens: PersistedToken[] = []
      for (const d of discovered) {
        const token = toToken(d)
        await vault.addToken(chain, token)
        const persisted: PersistedToken = {
          id: token.contractAddress ?? token.id,
          symbol: token.symbol,
          decimals: token.decimals,
          contractAddress: token.contractAddress ?? '',
        }
        chainTokens.push(persisted)
        allDiscovered.push({
          chain,
          contractAddress: persisted.contractAddress,
          symbol: persisted.symbol,
          decimals: persisted.decimals,
        })
      }
      if (chainTokens.length > 0) {
        let tokensToSave = chainTokens
        if (opts?.mergeExisting) {
          const existing = vault.getTokens(chain)
            .filter((t) => !chainTokens.some((ct) => ct.contractAddress === (t.contractAddress ?? t.id)))
            .map((t) => ({ id: t.id, symbol: t.symbol, decimals: t.decimals, contractAddress: t.contractAddress ?? '' }))
          tokensToSave = [...existing, ...chainTokens]
        }
        await persistTokens(vaultId, chain, tokensToSave)
      }
    } catch {
      // Chain doesn't support token discovery — skip
    }
  }

  return allDiscovered
}
