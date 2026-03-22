import type { Chain } from '@vultisig/sdk'
import { SUPPORTED_CHAINS } from '@vultisig/sdk'

import { InvalidChainError, UsageError } from './errors.js'

export function resolveChain(input: string): Chain {
  const inputLower = input.toLowerCase()

  const exact = SUPPORTED_CHAINS.find(c => c === input)
  if (exact) return exact

  const caseMatch = SUPPORTED_CHAINS.find(c => c.toLowerCase() === inputLower)
  if (caseMatch) return caseMatch

  const prefixMatches = SUPPORTED_CHAINS.filter(c => c.toLowerCase().startsWith(inputLower))
  if (prefixMatches.length === 1) {
    throw new InvalidChainError(
      `Unknown chain: "${input}". Did you mean: ${prefixMatches[0]}?`,
      `Use --chain ${prefixMatches[0]}`
    )
  }

  const suggestions = prefixMatches.length > 0
    ? prefixMatches
    : findClosest(input, SUPPORTED_CHAINS, 3)

  const hint = suggestions.length > 0
    ? `Did you mean: ${suggestions.join(', ')}?`
    : 'Run "vultisig chains" to list all supported chains'

  throw new InvalidChainError(
    `Unknown chain: "${input}". ${hint}`,
    'Run "vultisig chains" to list all chains'
  )
}

export function parseAmount(input: string): number {
  if (input === 'max') return -1

  const num = Number(input)
  if (isNaN(num) || num <= 0) {
    throw new UsageError(
      `Invalid amount: "${input}". Amount must be a positive number.`,
      'Use "max" to send the full balance'
    )
  }
  return num
}

const EVM_CHAINS: string[] = [
  'Arbitrum', 'Base', 'Blast', 'Optimism', 'Zksync', 'Mantle',
  'Avalanche', 'CronosChain', 'BSC', 'Ethereum', 'Polygon',
  'Hyperliquid', 'Sei',
]

export function isEvmChain(chain: string): boolean {
  return EVM_CHAINS.includes(chain)
}

function findClosest(input: string, candidates: readonly string[], maxResults: number): string[] {
  const inputLower = input.toLowerCase()
  const scored = candidates
    .map(c => ({ chain: c, dist: levenshtein(inputLower, c.toLowerCase()) }))
    .filter(s => s.dist <= Math.max(3, Math.floor(input.length / 2)))
    .sort((a, b) => a.dist - b.dist)
  return scored.slice(0, maxResults).map(s => s.chain)
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
