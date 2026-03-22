import { withVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { resolveChain } from '../lib/validation.js'
import { discoverAndPersistTokens } from '../lib/tokens.js'
import type { OutputFormat } from '../lib/output.js'
import type { BalanceResult } from '../types.js'

interface BalanceOpts {
  chain?: string
  includeTokens?: boolean
  fiat?: boolean
}

export async function getBalances(opts: BalanceOpts): Promise<BalanceResult[]> {
  const chain = opts.chain ? resolveChain(opts.chain) : undefined

  return withVault(async ({ vault, vaultEntry }) => {
    // Auto-discover tokens on first use if none persisted
    if (opts.includeTokens) {
      const hasPersistedTokens = Object.keys(vaultEntry.tokens ?? {}).length > 0
      if (!hasPersistedTokens) {
        const chains = chain ? [String(chain)] : [...vault.chains]
        await discoverAndPersistTokens(vault, vaultEntry.id, chains)
      }
    }

    const chainStr = chain ? String(chain) : undefined

    if (opts.fiat) {
      const chainsToFetch = chainStr ? [chainStr] : [...vault.chains]
      const results: BalanceResult[] = []

      for (const c of chainsToFetch) {
        try {
          const balances = await vault.balancesWithPrices([c], opts.includeTokens, 'usd')
          for (const b of Object.values(balances)) {
            const result: BalanceResult = {
              chain: b.chainId,
              symbol: b.symbol,
              amount: b.formattedAmount ?? b.amount,
            }
            if (b.fiatValue != null) {
              result.fiatValue = parseFloat(b.fiatValue.toFixed(2))
              result.fiatCurrency = 'USD'
            }
            if (b.tokenId) result.contractAddress = b.tokenId
            if (b.decimals != null) result.decimals = b.decimals
            results.push(result)
          }
        } catch {
          // Pricing failed for this chain — fall back to balances without fiat
          const balances = await vault.balances([c], opts.includeTokens)
          for (const b of Object.values(balances)) {
            results.push({
              chain: b.chainId,
              symbol: b.symbol,
              amount: b.formattedAmount ?? b.amount,
            })
          }
        }
      }

      return results
    }

    if (chainStr) {
      const balance = await vault.balance(chainStr, undefined)
      const results: BalanceResult[] = [{
        chain: balance.chainId ?? chainStr,
        symbol: balance.symbol,
        amount: balance.formattedAmount ?? balance.amount,
      }]
      if (opts.includeTokens) {
        const tokens = vault.getTokens(chainStr)
        for (const t of tokens) {
          const tokenId = t.id ?? t.contractAddress ?? ''
          try {
            const tb = await vault.balance(chainStr, tokenId)
            const tokenResult: BalanceResult = {
              chain: chainStr,
              symbol: tb.symbol ?? t.symbol,
              amount: tb.formattedAmount ?? tb.amount,
            }
            if (t.contractAddress) tokenResult.contractAddress = t.contractAddress
            if (t.decimals != null) tokenResult.decimals = t.decimals
            results.push(tokenResult)
          } catch {
            // skip tokens that fail to fetch
          }
        }
      }
      return results
    }

    const balances = await vault.balances(undefined, opts.includeTokens)
    return Object.values(balances).map((b) => {
      const result: BalanceResult = {
        chain: b.chainId,
        symbol: b.symbol,
        amount: b.formattedAmount ?? b.amount,
      }
      if (b.tokenId) result.contractAddress = b.tokenId
      if (b.decimals != null) result.decimals = b.decimals
      return result
    })
  })
}

export async function balanceCommand(opts: BalanceOpts, format: OutputFormat): Promise<void> {
  const results = await getBalances(opts)
  printResult(results, format)
}
