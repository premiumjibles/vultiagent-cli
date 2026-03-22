import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { UsageError } from '../lib/errors.js'
import { toToken } from '../lib/tokens.js'
import type { OutputFormat } from '../lib/output.js'

interface TokensOpts {
  chain?: string
  discover?: boolean
  add?: string
  symbol?: string
  decimals?: string
}

export async function tokensCommand(opts: TokensOpts, format: OutputFormat): Promise<void> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    if (opts.discover) {
      const chains = opts.chain ? [opts.chain] : [...vault.chains]
      const allDiscovered: Array<{ chain: string; contractAddress: string; symbol: string; decimals: number }> = []

      for (const chain of chains) {
        try {
          const discovered = await vault.discoverTokens(chain)
          for (const d of discovered) {
            const token = toToken(d)
            await vault.addToken(chain, token)
            allDiscovered.push({
              chain,
              contractAddress: token.contractAddress ?? '',
              symbol: token.symbol,
              decimals: token.decimals,
            })
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
      const token = {
        id: opts.add,
        symbol: opts.symbol ?? 'UNKNOWN',
        name: opts.symbol ?? 'Unknown Token',
        decimals: parseInt(opts.decimals ?? '18', 10),
        contractAddress: opts.add,
        chainId: opts.chain,
      }
      await vault.addToken(opts.chain, token)
      const balance = await vault.balance(opts.chain, opts.add)
      printResult({
        action: 'added',
        chain: opts.chain,
        token: opts.add,
        symbol: token.symbol,
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
