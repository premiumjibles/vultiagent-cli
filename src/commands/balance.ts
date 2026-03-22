import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { NetworkError } from '../lib/errors.js'
import type { OutputFormat } from '../lib/output.js'
import type { BalanceResult } from '../types.js'

const SYMBOL_TO_COINGECKO: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  RUNE: 'thorchain',
  SOL: 'solana',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  ATOM: 'cosmos',
  DOGE: 'dogecoin',
  LTC: 'litecoin',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  SUI: 'sui',
  TON: 'the-open-network',
  USDC: 'usd-coin',
  USDT: 'tether',
  PEPE: 'pepe',
  PUMP: 'pump',
  WETH: 'weth',
  WBTC: 'wrapped-bitcoin',
  DAI: 'dai',
  LINK: 'chainlink',
  UNI: 'uniswap',
  ARB: 'arbitrum',
}

async function fetchFiatPrices(symbols: string[]): Promise<Record<string, number>> {
  const ids = symbols
    .map((s) => SYMBOL_TO_COINGECKO[s.toUpperCase()])
    .filter(Boolean)

  if (ids.length === 0) return {}

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  const res = await fetch(url)
  if (!res.ok) return {}

  const data = await res.json() as Record<string, { usd: number }>

  const prices: Record<string, number> = {}
  for (const [symbol, cgId] of Object.entries(SYMBOL_TO_COINGECKO)) {
    if (data[cgId]) {
      prices[symbol] = data[cgId].usd
    }
  }
  return prices
}

interface BalanceOpts {
  chain?: string
  includeTokens?: boolean
  fiat?: boolean
}

export async function getBalances(opts: BalanceOpts): Promise<BalanceResult[]> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    let results: BalanceResult[]

    // Auto-discover tokens if --include-tokens is set
    if (opts.includeTokens) {
      const chains = opts.chain ? [opts.chain] : [...vault.chains]
      for (const chain of chains) {
        try {
          const discovered = await vault.discoverTokens(chain)
          for (const d of discovered) {
            const raw = d as Record<string, unknown>
            await vault.addToken(chain, {
              id: String(raw.contractAddress ?? raw.id ?? ''),
              symbol: String(raw.ticker ?? raw.symbol ?? 'UNKNOWN'),
              name: String(raw.ticker ?? raw.name ?? 'Unknown'),
              decimals: Number(raw.decimals ?? 18),
              contractAddress: String(raw.contractAddress ?? ''),
              chainId: chain,
            } as any)
          }
        } catch {
          // Chain doesn't support token discovery
        }
      }
    }

    if (opts.chain) {
      const balance = await vault.balance(opts.chain, undefined)
      results = [{
        chain: balance.chainId ?? opts.chain,
        symbol: balance.symbol,
        amount: balance.formattedAmount ?? balance.amount,
      }]
      // Also fetch token balances for this chain
      if (opts.includeTokens) {
        const tokens = vault.getTokens(opts.chain)
        for (const t of tokens) {
          const raw = t as Record<string, unknown>
          const tokenId = String(raw.id ?? raw.contractAddress ?? '')
          try {
            const tb = await vault.balance(opts.chain, tokenId)
            results.push({
              chain: opts.chain,
              symbol: tb.symbol ?? String(raw.symbol ?? raw.ticker ?? 'UNKNOWN'),
              amount: tb.formattedAmount ?? tb.amount,
            })
          } catch {
            // skip tokens that fail to fetch
          }
        }
      }
    } else {
      const balances = await vault.balances(undefined, opts.includeTokens)
      results = Object.values(balances).map((b) => ({
        chain: b.chainId,
        symbol: b.symbol,
        amount: b.formattedAmount ?? b.amount,
      }))
    }

    if (opts.fiat) {
      const symbols = results.map((r) => r.symbol)
      const prices = await fetchFiatPrices(symbols)
      for (const r of results) {
        const price = prices[r.symbol.toUpperCase()]
        if (price) {
          const usdValue = parseFloat(r.amount) * price
          r.fiatValue = `$${usdValue.toFixed(2)}`
          r.fiatCurrency = 'USD'
        }
      }
    }

    return results
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
