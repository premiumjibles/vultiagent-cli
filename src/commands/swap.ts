import { Vultisig } from '@vultisig/sdk'
import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { NetworkError } from '../lib/errors.js'
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

export async function getSwapQuote(opts: SwapOpts): Promise<SwapQuoteResult> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    const { quoteRequest } = buildSwapQuoteParams(opts)
    const quote = await vault.getSwapQuote(quoteRequest)

    return {
      fromChain: quote.fromCoin.chain,
      fromToken: quote.fromCoin.ticker,
      toChain: quote.toCoin.chain,
      toToken: quote.toCoin.ticker,
      inputAmount: opts.amount,
      estimatedOutput: String(quote.estimatedOutput),
      provider: quote.provider,
    }
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

export async function executeSwap(opts: SwapOpts): Promise<SwapResult> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    const { from, to, quoteRequest } = buildSwapQuoteParams(opts)
    const quote = await vault.getSwapQuote(quoteRequest)

    const { keysignPayload, approvalPayload } = await vault.prepareSwapTx({
      fromCoin: { chain: from.chain, token: from.token },
      toCoin: { chain: to.chain, token: to.token },
      amount: parseFloat(opts.amount),
      swapQuote: quote,
      autoApprove: false,
    })

    let approvalTxHash: string | undefined

    if (approvalPayload) {
      const approvalHashes = await vault.extractMessageHashes(approvalPayload)
      const approvalSig = await vault.sign(
        { transaction: approvalPayload, chain: from.chain, messageHashes: approvalHashes },
      )
      approvalTxHash = await vault.broadcastTx({
        chain: from.chain,
        keysignPayload: approvalPayload,
        signature: approvalSig,
      })
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    const messageHashes = await vault.extractMessageHashes(keysignPayload)
    const signature = await vault.sign(
      { transaction: keysignPayload, chain: from.chain, messageHashes },
    )

    const txHash = await vault.broadcastTx({
      chain: from.chain,
      keysignPayload,
      signature,
    })

    const explorerUrl = Vultisig.getTxExplorerUrl(from.chain, txHash)

    return { txHash, chain: from.chain, explorerUrl, approvalTxHash }
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('network') || err.message.includes('timeout'))) {
      throw new NetworkError(err.message)
    }
    throw err
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}

export async function swapCommand(opts: SwapOpts, format: OutputFormat): Promise<void> {
  const result = await executeSwap(opts)
  printResult(result, format)
}

export async function swapQuoteCommand(opts: SwapOpts, format: OutputFormat): Promise<void> {
  const result = await getSwapQuote(opts)
  printResult(result, format)
}

export async function swapChainsCommand(format: OutputFormat): Promise<void> {
  const result = await getSupportedChains()
  printResult(result, format)
}
