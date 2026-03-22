import { Vultisig } from '@vultisig/sdk'
import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { NetworkError, UsageError, NoRouteError, classifyError, VasigError } from '../lib/errors.js'
import { signWithRetry } from '../lib/signing.js'
import type { OutputFormat } from '../lib/output.js'
import type { SwapQuoteResult, SwapResult } from '../types.js'

interface SwapOpts {
  from: string
  to: string
  amount: string
  yes?: boolean
}

function parseChainToken(input: string): { chain: string; token?: string } {
  const parts = input.split(':')
  return { chain: parts[0], token: parts[1] }
}

function buildSwapQuoteParams(opts: SwapOpts) {
  const from = parseChainToken(opts.from)
  const to = parseChainToken(opts.to)

  if (!(parseFloat(opts.amount) > 0)) {
    throw new UsageError('Amount must be greater than 0')
  }
  if (from.chain === to.chain && from.token === to.token) {
    throw new UsageError('Cannot swap the same token')
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

function formatAmount(raw: bigint, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, s.length - decimals)
  const frac = s.slice(s.length - decimals).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

export async function getSwapQuote(opts: SwapOpts): Promise<SwapQuoteResult> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    const { quoteRequest } = buildSwapQuoteParams(opts)
    const quote = await vault.getSwapQuote(quoteRequest)

    const result: SwapQuoteResult = {
      fromChain: quote.fromCoin.chain,
      fromToken: quote.fromCoin.ticker,
      toChain: quote.toCoin.chain,
      toToken: quote.toCoin.ticker,
      inputAmount: opts.amount,
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
    if (!quote.estimatedOutputFiat && parseFloat(opts.amount) > 0) {
      result.warnings = [...(result.warnings ?? []), 'Quote output is near-zero — this route may result in fund loss.']
    }
    return result
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}

export async function getSupportedChains(): Promise<string[]> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    const chains = await vault.getSupportedSwapChains()
    return [...chains]
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}

export async function executeSwap(opts: SwapOpts, format: OutputFormat): Promise<SwapResult> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    const { from, to, quoteRequest } = buildSwapQuoteParams(opts)
    const quote = await vault.getSwapQuote(quoteRequest)

    if (!quote.estimatedOutputFiat && parseFloat(opts.amount) > 0) {
      throw new NoRouteError('Quote output is near-zero — this route would result in fund loss. Try a different route.')
    }

    // Log quote summary before executing
    const summary: SwapQuoteResult = {
      fromChain: quote.fromCoin.chain,
      fromToken: quote.fromCoin.ticker,
      toChain: quote.toCoin.chain,
      toToken: quote.toCoin.ticker,
      inputAmount: opts.amount,
      estimatedOutput: formatAmount(quote.estimatedOutput, quote.toCoin.decimals),
      provider: quote.provider,
    }
    if (quote.estimatedOutputFiat != null) {
      summary.estimatedOutputFiat = parseFloat(quote.estimatedOutputFiat.toFixed(2))
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

    const validation = await vault.validateTransaction(keysignPayload)
    if (validation?.isRisky && !opts.yes) {
      throw new UsageError(
        `Swap flagged as risky (${validation.riskLevel}): ${validation.description}`,
        `Details: ${validation.features.join(', ')}. Use --yes to override.`
      )
    }
    if (validation?.isRisky) {
      process.stderr.write(`⚠ Risk warning (${validation.riskLevel}): ${validation.description}\n`)
    }

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
    return result
  } catch (err: unknown) {
    if (err instanceof VasigError) throw err
    if (err instanceof Error && (err.message.includes('network') || err.message.includes('timeout'))) {
      throw new NetworkError(err.message)
    }
    if (err instanceof Error) throw classifyError(err)
    throw err
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}

export async function swapCommand(opts: SwapOpts, format: OutputFormat): Promise<void> {
  const result = await executeSwap(opts, format)
  printResult(result, format)
}

export async function swapQuoteCommand(opts: SwapOpts, format: OutputFormat): Promise<void> {
  const result = await getSwapQuote(opts)
  printResult(result, format)
}

export async function swapChainsCommand(format: OutputFormat): Promise<void> {
  const chains = await getSupportedChains()
  const unique = [...new Set(chains)]
  printResult(unique.map((c) => ({ chain: c })), format)
}
