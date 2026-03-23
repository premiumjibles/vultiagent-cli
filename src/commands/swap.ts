import { Vultisig } from '@vultisig/sdk'
import { withVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { UsageError, NoRouteError } from '../lib/errors.js'
import { resolveChain, parseAmount, assertNotRisky } from '../lib/validation.js'
import { signWithRetry } from '../lib/signing.js'
import type { OutputFormat } from '../lib/output.js'
import type { SwapQuoteResult, SwapDryRunResult, SwapResult } from '../types.js'

interface SwapOpts {
  from: string
  to: string
  amount: string
  yes?: boolean
  dryRun?: boolean
}

function parseChainToken(input: string): { chain: string; token?: string } {
  const parts = input.split(':')
  const chain = resolveChain(parts[0])
  return { chain, token: parts[1] }
}

function buildSwapQuoteParams(opts: SwapOpts) {
  const from = parseChainToken(opts.from)
  const to = parseChainToken(opts.to)

  parseAmount(opts.amount)
  if (from.chain === to.chain && from.token === to.token) {
    throw new UsageError('Cannot swap the same token', 'The --from and --to chains/tokens must differ')
  }

  return {
    from,
    to,
    quoteRequest: {
      fromCoin: { chain: from.chain, token: from.token },
      toCoin: { chain: to.chain, token: to.token },
      amount: parseFloat(opts.amount),
      fiatCurrency: 'usd' as const,
    },
  }
}

export function formatAmount(raw: bigint, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, s.length - decimals)
  const frac = s.slice(s.length - decimals).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

interface QuoteLike {
  fromCoin: { chain: string; ticker: string }
  toCoin: { chain: string; ticker: string; decimals: number }
  estimatedOutput: bigint
  estimatedOutputFiat?: number | null
  requiresApproval?: boolean
  warnings: string[]
  provider: string
}

export function mapQuoteResult(quote: QuoteLike, inputAmount: string): SwapQuoteResult {
  const result: SwapQuoteResult = {
    fromChain: quote.fromCoin.chain,
    fromToken: quote.fromCoin.ticker,
    toChain: quote.toCoin.chain,
    toToken: quote.toCoin.ticker,
    inputAmount,
    estimatedOutput: formatAmount(quote.estimatedOutput, quote.toCoin.decimals),
    provider: quote.provider,
  }
  if (quote.estimatedOutputFiat != null) {
    result.estimatedOutputFiat = parseFloat(quote.estimatedOutputFiat.toFixed(2))
  }
  if (quote.requiresApproval) {
    result.requiresApproval = true
  }
  if (quote.warnings.length > 0) {
    result.warnings = [...quote.warnings]
  }
  return result
}

export async function getSwapQuote(opts: SwapOpts, vaultId?: string): Promise<SwapQuoteResult> {
  return withVault(async ({ vault }) => {
    const { quoteRequest } = buildSwapQuoteParams(opts)
    const quote = await vault.getSwapQuote(quoteRequest)

    const result = mapQuoteResult(quote, opts.amount)
    if ((quote.estimatedOutputFiat == null || quote.estimatedOutputFiat < 0.01) && parseFloat(opts.amount) > 0) {
      result.warnings = [...(result.warnings ?? []), 'Quote output is near-zero — this route may result in fund loss.']
    }
    return result
  }, vaultId)
}

export async function getSupportedChains(vaultId?: string): Promise<string[]> {
  return withVault(async ({ vault }) => {
    const chains = await vault.getSupportedSwapChains()
    return [...chains]
  }, vaultId)
}

export async function executeSwap(opts: SwapOpts, format: OutputFormat, vaultId?: string): Promise<SwapResult | SwapDryRunResult> {
  return withVault(async ({ vault }) => {
    const { from, to, quoteRequest } = buildSwapQuoteParams(opts)
    const quote = await vault.getSwapQuote(quoteRequest)

    if ((quote.estimatedOutputFiat == null || quote.estimatedOutputFiat < 0.01) && parseFloat(opts.amount) > 0) {
      throw new NoRouteError(
        'Quote output is near-zero — this route would result in fund loss. Try a different route.',
        'Try a different token pair or a larger amount',
      )
    }

    // Log quote summary before executing
    const summary = mapQuoteResult(quote, opts.amount)

    if (opts.dryRun) {
      return { dryRun: true as const, ...summary }
    }
    if (format !== 'json') {
      printResult({ action: 'quote', ...summary }, format)
    }

    const { keysignPayload, approvalPayload } = await vault.prepareSwapTx({
      fromCoin: { chain: from.chain, token: from.token },
      toCoin: { chain: to.chain, token: to.token },
      amount: parseFloat(opts.amount),
      swapQuote: quote,
      autoApprove: false,
    })

    await assertNotRisky(vault, keysignPayload, opts)

    let approvalTxHash: string | undefined

    if (approvalPayload) {
      const approvalHashes = await vault.extractMessageHashes(approvalPayload)
      const approvalSig = await signWithRetry(() =>
        vault.sign({ transaction: approvalPayload, chain: from.chain, messageHashes: approvalHashes }),
      )
      approvalTxHash = await vault.broadcastTx({
        chain: from.chain,
        keysignPayload: approvalPayload,
        signature: approvalSig,
      })
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    const messageHashes = await vault.extractMessageHashes(keysignPayload)
    const signature = await signWithRetry(() =>
      vault.sign({ transaction: keysignPayload, chain: from.chain, messageHashes }),
    )

    const txHash = await vault.broadcastTx({
      chain: from.chain,
      keysignPayload,
      signature,
    })

    const explorerUrl = Vultisig.getTxExplorerUrl(from.chain, txHash)

    const result: SwapResult = { txHash, chain: from.chain, explorerUrl }
    if (approvalTxHash) result.approvalTxHash = approvalTxHash
    return result as SwapResult
  }, vaultId)
}

export async function swapCommand(opts: SwapOpts, format: OutputFormat, vaultId?: string): Promise<void> {
  const result = await executeSwap(opts, format, vaultId)
  printResult(result, format)
}

export async function swapQuoteCommand(opts: SwapOpts, format: OutputFormat, vaultId?: string): Promise<void> {
  const result = await getSwapQuote(opts, vaultId)
  printResult(result, format)
}

export async function swapChainsCommand(format: OutputFormat, vaultId?: string): Promise<void> {
  const chains = await getSupportedChains(vaultId)
  const unique = [...new Set(chains)]
  printResult(unique.map((c) => ({ chain: c })), format)
}
