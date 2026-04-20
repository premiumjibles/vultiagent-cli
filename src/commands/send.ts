import { Vultisig } from '@vultisig/sdk'
import { withVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { UsageError, InsufficientBalanceError } from '../lib/errors.js'
import { resolveChain, parseAmount, isEvmChain, assertNotRisky, assertBroadcastConfirmed, truncateForPrompt } from '../lib/validation.js'
import { signWithRetry } from '../lib/signing.js'
import type { OutputFormat } from '../lib/output.js'
import type { SendResult, SendDryRunResult } from '../types.js'

interface SendOpts {
  chain: string
  to: string
  amount: string
  token?: string
  memo?: string
  yes?: boolean
  dryRun?: boolean
  nonInteractive?: boolean
}

export async function executeSend(opts: SendOpts, vaultId?: string): Promise<SendResult | SendDryRunResult> {
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

  return withVault(async ({ vault }) => {
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

    const hasInsufficientBalance = amount > BigInt(balance.amount)

    if (opts.dryRun) {
      const displayAmount = opts.amount === 'max'
        ? (balance.formattedAmount ?? balance.amount)
        : opts.amount
      const result: SendDryRunResult = {
        dryRun: true,
        chain: chain,
        to: opts.to,
        amount: displayAmount,
        symbol: balance.symbol,
        balance: balance.formattedAmount ?? balance.amount,
      }
      if (hasInsufficientBalance) {
        result.warning = `Insufficient balance: you have ${balance.formattedAmount ?? balance.amount} ${balance.symbol}`
      }
      return result
    }

    if (hasInsufficientBalance) {
      throw new InsufficientBalanceError(
        `Insufficient balance: you have ${balance.formattedAmount ?? balance.amount} ${balance.symbol}, tried to send ${opts.amount}`,
        `Check balance: vasig balance --chain ${chain}`,
      )
    }

    const payload = await vault.prepareSendTx({
      coin,
      receiver: opts.to,
      amount,
      memo: opts.memo,
    })

    // P0-7: require explicit intent before broadcast. Prompts on TTY,
    // hard-errors in non-interactive mode without --yes.
    const displayAmount = opts.amount === 'max'
      ? (balance.formattedAmount ?? balance.amount)
      : opts.amount
    await assertBroadcastConfirmed(
      opts,
      `Send ${displayAmount} ${balance.symbol} on ${chain} to ${truncateForPrompt(opts.to)}?`,
    )

    await assertNotRisky(vault, payload, opts)

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

    return { txHash, chain: chain, explorerUrl, amount: displayAmount, to: opts.to, symbol: balance.symbol }
  }, vaultId)
}

export async function sendCommand(opts: SendOpts, format: OutputFormat, vaultId?: string): Promise<void> {
  const result = await executeSend(opts, vaultId)
  printResult(result, format)
}
