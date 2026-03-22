import { Vultisig } from '@vultisig/sdk'
import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import { NetworkError } from '../lib/errors.js'
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
  const { sdk, vault } = await createSdkWithVault()

  try {
    const address = await vault.address(opts.chain)
    const balance = await vault.balance(opts.chain, opts.token)

    const coin = {
      chain: opts.chain,
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

    const payload = await vault.prepareSendTx({
      coin,
      receiver: opts.to,
      amount,
      memo: opts.memo,
    })

    const messageHashes = await vault.extractMessageHashes(payload)
    const signature = await vault.sign(
      { transaction: payload, chain: opts.chain, messageHashes },
      {}
    )
    const txHash = await vault.broadcastTx({
      chain: opts.chain,
      keysignPayload: payload,
      signature,
    })

    const explorerUrl = Vultisig.getTxExplorerUrl(opts.chain, txHash)

    return { txHash, chain: opts.chain, explorerUrl }
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('network') || err.message.includes('timeout'))) {
      throw new NetworkError(err.message)
    }
    throw err
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}

export async function sendCommand(opts: SendOpts, format: OutputFormat): Promise<void> {
  const result = await executeSend(opts)
  printResult(result, format)
}
