import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { NetworkError } from '../lib/errors.js'
import { toToken } from '../lib/tokens.js'
import { persistTokens } from '../auth/config.js'
import type { PersistedToken } from '../auth/config.js'
import type { OutputFormat } from '../lib/output.js'
import type { BalanceResult } from '../types.js'

interface BalanceOpts {
  chain?: string
  includeTokens?: boolean
  fiat?: boolean
}

export async function getBalances(opts: BalanceOpts): Promise<BalanceResult[]> {
  const { sdk, vault, vaultEntry } = await createSdkWithVault()

  try {
    // Auto-discover tokens on first use if none persisted
    if (opts.includeTokens) {
      const hasPersistedTokens = Object.keys(vaultEntry.tokens ?? {}).length > 0
      if (!hasPersistedTokens) {
        const chains = opts.chain ? [opts.chain] : [...vault.chains]
        for (const chain of chains) {
          try {
            const discovered = await vault.discoverTokens(chain)
            const chainTokens: PersistedToken[] = []
            for (const d of discovered) {
              const token = toToken(d)
              await vault.addToken(chain, token)
              chainTokens.push({
                id: token.contractAddress ?? token.id,
                symbol: token.symbol,
                decimals: token.decimals,
                contractAddress: token.contractAddress ?? '',
              })
            }
            if (chainTokens.length > 0) {
              await persistTokens(vaultEntry.id, chain, chainTokens)
            }
          } catch {
            // Chain doesn't support token discovery
          }
        }
      }
    }

    const chains = opts.chain ? [opts.chain] : undefined

    if (opts.fiat) {
      const balances = await vault.balancesWithPrices(chains, opts.includeTokens, 'usd')
      return Object.values(balances).map((b) => {
        const result: BalanceResult = {
          chain: b.chainId,
          symbol: b.symbol,
          amount: b.formattedAmount ?? b.amount,
        }
        if (b.fiatValue != null) {
          result.fiatValue = `$${b.fiatValue.toFixed(2)}`
          result.fiatCurrency = 'USD'
        }
        return result
      })
    }

    if (opts.chain) {
      const balance = await vault.balance(opts.chain, undefined)
      const results: BalanceResult[] = [{
        chain: balance.chainId ?? opts.chain,
        symbol: balance.symbol,
        amount: balance.formattedAmount ?? balance.amount,
      }]
      if (opts.includeTokens) {
        const tokens = vault.getTokens(opts.chain)
        for (const t of tokens) {
          const tokenId = t.id ?? t.contractAddress ?? ''
          try {
            const tb = await vault.balance(opts.chain, tokenId)
            results.push({
              chain: opts.chain,
              symbol: tb.symbol ?? t.symbol,
              amount: tb.formattedAmount ?? tb.amount,
            })
          } catch {
            // skip tokens that fail to fetch
          }
        }
      }
      return results
    }

    const balances = await vault.balances(undefined, opts.includeTokens)
    return Object.values(balances).map((b) => ({
      chain: b.chainId,
      symbol: b.symbol,
      amount: b.formattedAmount ?? b.amount,
    }))
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('network') || err.message.includes('timeout'))) {
      throw new NetworkError(err.message)
    }
    throw err
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}

export async function balanceCommand(opts: BalanceOpts, format: OutputFormat): Promise<void> {
  const results = await getBalances(opts)
  printResult(results, format)
}
