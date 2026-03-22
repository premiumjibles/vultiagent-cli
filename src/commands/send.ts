import { Vultisig } from '@vultisig/sdk'
import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { NetworkError, UsageError, InsufficientBalanceError, classifyError, VasigError } from '../lib/errors.js'
import { resolveChain, parseAmount, isEvmChain } from '../lib/validation.js'
import { signWithRetry } from '../lib/signing.js'
import type { OutputFormat } from '../lib/output.js'
import type { SendResult } from '../types.js'

interface SendOpts {
  chain: string
  to: string
  amount: string
  token?: string
  memo?: string
  yes?: boolean
}

export async function executeSend(opts: SendOpts): Promise<SendResult> {
  const chain = resolveChain(opts.chain)

  if (opts.amount !== 'max') {
    parseAmount(opts.amount)
  }

  if (opts.memo && isEvmChain(chain)) {
    throw new UsageError(
      'Memos are not supported on EVM chains',
      'EVM transactions use the data field for contract calls. Remove the --memo flag.'
    )
  }

  const { sdk, vault } = await createSdkWithVault()

  try {
    const address = await vault.address(chain)
    const balance = await vault.balance(chain, opts.token)

    const coin = {
      chain: chain,
      address,
      decimals: balance.decimals,
      ticker: balance.symbol,
      id: opts.token,
    }

    let amount: bigint
    if (opts.amount === 'max') {
      const maxInfo = await vault.getMaxSendAmount({
        coin,
        receiver: opts.to,
        memo: opts.memo,
      })
      amount = maxInfo.maxSendable
    } else {
      const [whole, frac = ''] = opts.amount.split('.')
      const paddedFrac = frac.padEnd(balance.decimals, '0').slice(0, balance.decimals)
      amount = BigInt(whole || '0') * 10n ** BigInt(balance.decimals) + BigInt(paddedFrac || '0')
    }

    if (amount > BigInt(balance.amount)) {
      throw new InsufficientBalanceError(
        `Insufficient balance: you have ${balance.formattedAmount ?? balance.amount} ${balance.symbol}, tried to send ${opts.amount}`,
      )
    }

    const payload = await vault.prepareSendTx({
      coin,
      receiver: opts.to,
      amount,
      memo: opts.memo,
    })

    const validation = await vault.validateTransaction(payload)
    if (validation?.isRisky && !opts.yes) {
      throw new UsageError(
        `Transaction flagged as risky (${validation.riskLevel}): ${validation.description}`,
        `Details: ${validation.features.join(', ')}. Use --yes to override.`
      )
    }
    if (validation?.isRisky) {
      process.stderr.write(`⚠ Risk warning (${validation.riskLevel}): ${validation.description}\n`)
    }

    const messageHashes = await vault.extractMessageHashes(payload)
    const signature = await signWithRetry(() =>
      vault.sign({ transaction: payload, chain: chain, messageHashes }),
    )
    const txHash = await vault.broadcastTx({
      chain: chain,
      keysignPayload: payload,
      signature,
    })

    const explorerUrl = Vultisig.getTxExplorerUrl(chain, txHash)

    const displayAmount = opts.amount === 'max'
      ? (balance.formattedAmount ?? balance.amount)
      : opts.amount

    return { txHash, chain: chain, explorerUrl, amount: displayAmount, to: opts.to, symbol: balance.symbol }
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

export async function sendCommand(opts: SendOpts, format: OutputFormat): Promise<void> {
  const result = await executeSend(opts)
  printResult(result, format)
}
