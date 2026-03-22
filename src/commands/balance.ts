import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { NetworkError } from '../lib/errors.js'
import type { OutputFormat } from '../lib/output.js'
import type { BalanceResult } from '../types.js'

interface BalanceOpts {
  chain?: string
  includeTokens?: boolean
}

export async function getBalances(opts: BalanceOpts): Promise<BalanceResult[]> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    if (opts.chain) {
      const balance = await vault.balance(opts.chain, undefined)
      return [{
        chain: balance.chainId ?? opts.chain,
        symbol: balance.symbol,
        amount: balance.formattedAmount ?? balance.amount,
        fiatValue: balance.fiatValue != null ? String(balance.fiatValue) : undefined,
        fiatCurrency: balance.fiatCurrency,
      }]
    }

    const balances = await vault.balances(undefined, opts.includeTokens)
    return Object.values(balances).map((b) => ({
      chain: b.chainId,
      symbol: b.symbol,
      amount: b.formattedAmount ?? b.amount,
      fiatValue: b.fiatValue != null ? String(b.fiatValue) : undefined,
      fiatCurrency: b.fiatCurrency,
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
