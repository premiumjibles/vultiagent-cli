import { z } from 'zod'
import { getBalances } from '../commands/balance.js'
import { getAddresses } from '../commands/addresses.js'
import { getVaultInfo } from '../commands/vault.js'
import { getSwapQuote, getSupportedChains, executeSwap } from '../commands/swap.js'
import { executeSend } from '../commands/send.js'
import { VasigError, UsageError, classifyError } from '../lib/errors.js'

interface ToolResult {
  [key: string]: unknown
  content: [{ type: 'text'; text: string }]
  isError?: boolean
}

function success(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

function error(message: string, hint?: string): ToolResult {
  const payload: Record<string, string> = { error: message }
  if (hint) payload.hint = hint
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true }
}

async function wrapHandler<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    const result = await fn()
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

export interface ToolDef {
  description: string
  inputSchema: z.ZodObject<z.ZodRawShape>
  handler: (args: Record<string, unknown>) => Promise<ToolResult>
}

export function getTools(): Record<string, ToolDef> {
  return {
    get_balances: {
      description: 'Get native token balances for all chains or a specific chain',
      inputSchema: z.object({
        chain: z.string().optional().describe('Filter by chain name (e.g. Ethereum, Bitcoin)'),
        includeTokens: z.boolean().optional().describe('Include ERC-20/SPL token balances'),
      }),
      handler: (args) => wrapHandler(() =>
        getBalances({ chain: args.chain as string | undefined, includeTokens: args.includeTokens as boolean | undefined, fiat: false }),
      ),
    },

    get_portfolio: {
      description: 'Get balances with fiat (USD) valuations for all chains or a specific chain',
      inputSchema: z.object({
        chain: z.string().optional().describe('Filter by chain name'),
        includeTokens: z.boolean().optional().describe('Include ERC-20/SPL token balances'),
      }),
      handler: (args) => wrapHandler(() =>
        getBalances({ chain: args.chain as string | undefined, includeTokens: args.includeTokens as boolean | undefined, fiat: true }),
      ),
    },

    get_address: {
      description: 'Get the wallet address for a specific chain',
      inputSchema: z.object({
        chain: z.string().describe('Chain name (e.g. Ethereum, Bitcoin)'),
      }),
      handler: (args) => wrapHandler(async () => {
        const addresses = await getAddresses()
        const chain = args.chain as string
        const match = addresses.find((a) => a.chain.toLowerCase() === chain.toLowerCase())
        if (!match) throw new UsageError(`Chain "${chain}" not found in vault`, 'Check vault_info for available chains')
        return match
      }),
    },

    vault_info: {
      description: 'Get vault metadata including name, type, chains, and signer configuration',
      inputSchema: z.object({}),
      handler: () => wrapHandler(() => getVaultInfo()),
    },

    supported_chains: {
      description: 'List chains supported for swaps',
      inputSchema: z.object({}),
      handler: () => wrapHandler(() => getSupportedChains()),
    },

    swap_quote: {
      description: 'Get a swap quote showing estimated output and provider',
      inputSchema: z.object({
        from: z.string().describe('Source chain or chain:token (e.g. Ethereum or Ethereum:USDC)'),
        to: z.string().describe('Destination chain or chain:token'),
        amount: z.string().describe('Amount to swap'),
      }),
      handler: (args) => wrapHandler(() =>
        getSwapQuote({ from: args.from as string, to: args.to as string, amount: args.amount as string }),
      ),
    },

    send: {
      description: 'Send tokens to an address. Set confirmed=false for a dry-run preview first.',
      inputSchema: z.object({
        chain: z.string().describe('Chain to send on (e.g. Ethereum)'),
        to: z.string().describe('Recipient address'),
        amount: z.string().describe('Amount to send (or "max")'),
        token: z.string().optional().describe('Token contract address (for ERC-20/SPL tokens)'),
        memo: z.string().optional().describe('Transaction memo (non-EVM chains only)'),
        confirmed: z.boolean().optional().describe('Set true to execute, false/omit for dry-run preview'),
      }),
      handler: (args) => wrapHandler(() =>
        executeSend({
          chain: args.chain as string,
          to: args.to as string,
          amount: args.amount as string,
          token: args.token as string | undefined,
          memo: args.memo as string | undefined,
          dryRun: !args.confirmed,
          yes: true,
        }),
      ),
    },

    swap: {
      description: 'Execute a token swap. Set confirmed=false for a dry-run preview first.',
      inputSchema: z.object({
        from: z.string().describe('Source chain or chain:token (e.g. Ethereum or Ethereum:USDC)'),
        to: z.string().describe('Destination chain or chain:token'),
        amount: z.string().describe('Amount to swap'),
        confirmed: z.boolean().optional().describe('Set true to execute, false/omit for dry-run preview'),
      }),
      handler: (args) => wrapHandler(() =>
        executeSwap({
          from: args.from as string,
          to: args.to as string,
          amount: args.amount as string,
          dryRun: !args.confirmed,
          yes: true,
        }),
      ),
    },
  }
}
