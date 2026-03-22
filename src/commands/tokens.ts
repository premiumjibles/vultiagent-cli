import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { UsageError } from '../lib/errors.js'
import { toToken } from '../lib/tokens.js'
import { persistTokens, removePersistedToken, clearPersistedTokens } from '../auth/config.js'
import type { PersistedToken } from '../auth/config.js'
import type { OutputFormat } from '../lib/output.js'

interface TokensOpts {
  chain?: string
  discover?: boolean
  add?: string
  remove?: string
  clear?: boolean
  symbol?: string
  decimals?: string
}

export async function tokensCommand(opts: TokensOpts, format: OutputFormat): Promise<void> {
  const { sdk, vault, vaultEntry } = await createSdkWithVault()

  try {
    if (opts.clear) {
      await clearPersistedTokens(vaultEntry.id, opts.chain)
      printResult({
        action: 'cleared',
        chain: opts.chain ?? 'all',
      }, format)
      return
    }

    if (opts.remove) {
      if (!opts.chain) {
        throw new UsageError('--chain is required when removing a token', 'vasig tokens --chain Ethereum --remove 0x...')
      }
      await removePersistedToken(vaultEntry.id, opts.chain, opts.remove)
      printResult({
        action: 'removed',
        chain: opts.chain,
        token: opts.remove,
      }, format)
      return
    }

    if (opts.discover) {
      const chains = opts.chain ? [opts.chain] : [...vault.chains]
      const allDiscovered: Array<{ chain: string; contractAddress: string; symbol: string; decimals: number }> = []

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
            // Merge with existing persisted tokens for this chain
            const existing = vault.getTokens(chain)
              .filter((t) => !chainTokens.some((ct) => ct.contractAddress === (t.contractAddress ?? t.id)))
              .map((t) => ({ id: t.id, symbol: t.symbol, decimals: t.decimals, contractAddress: t.contractAddress ?? '' }))
            await persistTokens(vaultEntry.id, chain, [...existing, ...chainTokens])
          }
        } catch {
          // Chain doesn't support discovery — skip
        }
      }

      printResult({
        action: 'discover',
        discovered: allDiscovered,
        count: allDiscovered.length,
      }, format)
      return
    }

    if (opts.add) {
      if (!opts.chain) {
        throw new UsageError('--chain is required when adding a token', 'vasig tokens --chain Ethereum --add 0x...')
      }

      // Auto-resolve metadata if symbol not provided
      let symbol = opts.symbol
      let decimals = parseInt(opts.decimals ?? '18', 10)
      if (!opts.symbol) {
        try {
          const info = await vault.resolveToken(opts.chain, opts.add)
          symbol = info.ticker
          decimals = info.decimals
        } catch {
          symbol = 'UNKNOWN'
        }
      }

      const token = {
        id: opts.add,
        symbol: symbol!,
        name: symbol!,
        decimals,
        contractAddress: opts.add,
        chainId: opts.chain,
      }
      await vault.addToken(opts.chain, token)
      const balance = await vault.balance(opts.chain, opts.add)

      // Persist
      const existing = (vaultEntry.tokens?.[opts.chain] ?? [])
        .filter((t) => t.contractAddress !== opts.add)
      await persistTokens(vaultEntry.id, opts.chain, [
        ...existing,
        { id: opts.add, symbol: symbol!, decimals, contractAddress: opts.add },
      ])

      printResult({
        action: 'added',
        chain: opts.chain,
        token: opts.add,
        symbol: symbol!,
        balance: balance.formattedAmount ?? balance.amount,
      }, format)
      return
    }

    // List tracked tokens
    const tokenList: Array<{ chain: string; id: string; symbol: string }> = []
    for (const chain of vault.chains) {
      const tokens = vault.getTokens(chain)
      for (const t of tokens) {
        tokenList.push({
          chain,
          id: t.id ?? t.contractAddress ?? '',
          symbol: t.symbol,
        })
      }
    }

    printResult({
      tokens: tokenList,
      count: tokenList.length,
    }, format)
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}
