import { withVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { UsageError, TokenNotFoundError } from '../lib/errors.js'
import { resolveChain } from '../lib/validation.js'
import { discoverAndPersistTokens } from '../lib/tokens.js'
import { persistTokens, removePersistedToken, clearPersistedTokens } from '../auth/config.js'
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
  return withVault(async ({ vault, vaultEntry }) => {
    const chain = opts.chain ? resolveChain(opts.chain) : undefined

    if (opts.clear) {
      await clearPersistedTokens(vaultEntry.id, chain ? String(chain) : undefined)
      printResult({
        action: 'cleared',
        chain: chain ?? 'all',
      }, format)
      return
    }

    if (opts.remove) {
      if (!chain) {
        throw new UsageError('--chain is required when removing a token', 'vasig tokens --chain Ethereum --remove 0x...')
      }
      const tokens = vault.getTokens(String(chain))
      const exists = tokens?.some((t) => t.id === opts.remove || t.contractAddress === opts.remove)
      if (!exists) {
        throw new TokenNotFoundError(
          `Token "${opts.remove}" not found on ${chain}`,
          `Run "vasig tokens --chain ${chain}" to list tokens`
        )
      }
      await removePersistedToken(vaultEntry.id, String(chain), opts.remove!)
      printResult({
        action: 'removed',
        chain: String(chain),
        token: opts.remove,
      }, format)
      return
    }

    if (opts.discover) {
      const chains = chain ? [String(chain)] : [...vault.chains]
      const allDiscovered = await discoverAndPersistTokens(vault, vaultEntry.id, chains, { mergeExisting: true })

      printResult({
        action: 'discover',
        discovered: allDiscovered,
        count: allDiscovered.length,
      }, format)
      return
    }

    if (opts.add) {
      if (!chain) {
        throw new UsageError('--chain is required when adding a token', 'vasig tokens --chain Ethereum --add 0x...')
      }

      // Auto-resolve metadata if symbol not provided
      let symbol = opts.symbol
      let decimals = parseInt(opts.decimals ?? '18', 10)
      if (!opts.symbol) {
        try {
          const info = await vault.resolveToken(String(chain), opts.add)
          symbol = info.ticker
          decimals = info.decimals
        } catch {
          symbol = 'UNKNOWN'
        }
      }

      const chainStr = String(chain)
      const token = {
        id: opts.add,
        symbol: symbol!,
        name: symbol!,
        decimals,
        contractAddress: opts.add,
        chainId: chainStr,
      }
      await vault.addToken(chainStr, token)
      const balance = await vault.balance(chainStr, opts.add)

      // Persist
      const existing = (vaultEntry.tokens?.[chainStr] ?? [])
        .filter((t) => t.contractAddress !== opts.add)
      await persistTokens(vaultEntry.id, chainStr, [
        ...existing,
        { id: opts.add, symbol: symbol!, decimals, contractAddress: opts.add },
      ])

      printResult({
        action: 'added',
        chain: chainStr,
        token: opts.add,
        symbol: symbol!,
        balance: balance.formattedAmount ?? balance.amount,
      }, format)
      return
    }

    // List tracked tokens
    const tokenList: Array<{ chain: string; id: string; symbol: string }> = []
    for (const c of vault.chains) {
      const tokens = vault.getTokens(c)
      for (const t of tokens) {
        tokenList.push({
          chain: c,
          id: t.id ?? t.contractAddress ?? '',
          symbol: t.symbol,
        })
      }
    }

    printResult({
      tokens: tokenList,
      count: tokenList.length,
    }, format)
  })
}
