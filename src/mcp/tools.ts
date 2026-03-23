import { getBalances } from '../commands/balance.js'
import { getAddresses } from '../commands/addresses.js'
import { getVaultInfo } from '../commands/vault.js'
import { getSwapQuote, getSupportedChains, executeSwap } from '../commands/swap.js'
import { executeSend } from '../commands/send.js'
import { VasigError, UsageError, classifyError } from '../lib/errors.js'

interface ToolResult {
  content: [{ type: 'text'; text: string }]
  isError?: boolean
}

type ToolInput = Record<string, unknown>

interface ToolDef {
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  handler: (input: ToolInput) => Promise<ToolResult>
}

function success(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

function error(message: string, hint?: string): ToolResult {
  const payload: Record<string, string> = { error: message }
  if (hint) payload.hint = hint
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true }
}

function wrapHandler(fn: (input: ToolInput) => Promise<unknown>): (input: ToolInput) => Promise<ToolResult> {
  return async (input) => {
    try {
      const result = await fn(input)
      return success(result)
    } catch (err: unknown) {
      if (err instanceof VasigError) {
        return error(err.message, err.hint)
      }
      if (err instanceof Error) {
        const classified = classifyError(err)
        return error(classified.message, classified.hint)
      }
      return error(String(err))
    }
  }
}

export function getTools(): Record<string, ToolDef> {
  return {
    get_balances: {
      description: 'Get native token balances for all chains or a specific chain',
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Filter by chain name (e.g. Ethereum, Bitcoin)' },
          includeTokens: { type: 'boolean', description: 'Include ERC-20/SPL token balances' },
        },
      },
      handler: wrapHandler(async (input) => {
        return getBalances({ chain: input.chain as string | undefined, includeTokens: input.includeTokens as boolean | undefined, fiat: false })
      }),
    },

    get_portfolio: {
      description: 'Get balances with fiat (USD) valuations for all chains or a specific chain',
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Filter by chain name' },
          includeTokens: { type: 'boolean', description: 'Include ERC-20/SPL token balances' },
        },
      },
      handler: wrapHandler(async (input) => {
        return getBalances({ chain: input.chain as string | undefined, includeTokens: input.includeTokens as boolean | undefined, fiat: true })
      }),
    },

    get_address: {
      description: 'Get the wallet address for a specific chain',
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Chain name (e.g. Ethereum, Bitcoin)' },
        },
        required: ['chain'],
      },
      handler: wrapHandler(async (input) => {
        const addresses = await getAddresses()
        const chain = input.chain as string
        const match = addresses.find((a) => a.chain.toLowerCase() === chain.toLowerCase())
        if (!match) throw new UsageError(`Chain "${chain}" not found in vault`, 'Check vault_info for available chains')
        return match
      }),
    },

    vault_info: {
      description: 'Get vault metadata including name, type, chains, and signer configuration',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: wrapHandler(async () => {
        return getVaultInfo()
      }),
    },

    supported_chains: {
      description: 'List chains supported for swaps',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: wrapHandler(async () => {
        return getSupportedChains()
      }),
    },

    swap_quote: {
      description: 'Get a swap quote showing estimated output and provider',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source chain or chain:token (e.g. Ethereum or Ethereum:USDC)' },
          to: { type: 'string', description: 'Destination chain or chain:token' },
          amount: { type: 'string', description: 'Amount to swap' },
        },
        required: ['from', 'to', 'amount'],
      },
      handler: wrapHandler(async (input) => {
        return getSwapQuote({ from: input.from as string, to: input.to as string, amount: input.amount as string })
      }),
    },

    send: {
      description: 'Send tokens to an address. Set confirmed=false for a dry-run preview first.',
      inputSchema: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Chain to send on (e.g. Ethereum)' },
          to: { type: 'string', description: 'Recipient address' },
          amount: { type: 'string', description: 'Amount to send (or "max")' },
          token: { type: 'string', description: 'Token contract address (for ERC-20/SPL tokens)' },
          memo: { type: 'string', description: 'Transaction memo (non-EVM chains only)' },
          confirmed: { type: 'boolean', description: 'Set true to execute, false for dry-run preview' },
        },
        required: ['chain', 'to', 'amount'],
      },
      handler: wrapHandler(async (input) => {
        const confirmed = input.confirmed as boolean | undefined
        return executeSend({
          chain: input.chain as string,
          to: input.to as string,
          amount: input.amount as string,
          token: input.token as string | undefined,
          memo: input.memo as string | undefined,
          dryRun: !confirmed,
          yes: true,
        })
      }),
    },

    swap: {
      description: 'Execute a token swap. Set confirmed=false for a dry-run preview first.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source chain or chain:token (e.g. Ethereum or Ethereum:USDC)' },
          to: { type: 'string', description: 'Destination chain or chain:token' },
          amount: { type: 'string', description: 'Amount to swap' },
          confirmed: { type: 'boolean', description: 'Set true to execute, false for dry-run preview' },
        },
        required: ['from', 'to', 'amount'],
      },
      handler: wrapHandler(async (input) => {
        const confirmed = input.confirmed as boolean | undefined
        return executeSwap({
          from: input.from as string,
          to: input.to as string,
          amount: input.amount as string,
          dryRun: !confirmed,
          yes: true,
        })
      }),
    },
  }
}
