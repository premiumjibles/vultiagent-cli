import type { DiscoveredToken, Token } from '@vultisig/sdk'

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
