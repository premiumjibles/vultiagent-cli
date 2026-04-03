#!/usr/bin/env node
import { Command, CommanderError, InvalidArgumentError } from 'commander'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { VasigError, UsageError, ExitCode, EXIT_CODE_DESCRIPTIONS, classifyError } from './lib/errors.js'
import { findClosest } from './lib/validation.js'
import { printError, setQuiet, setFields } from './lib/output.js'
import type { OutputFormat } from './lib/output.js'

// Commander stores hidden state as _hidden but doesn't expose it in types
interface CommandWithHidden extends Command { _hidden?: boolean }

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

const program = new Command()

program
  .name('vasig')
  .description('Agent-friendly Vultisig CLI with keyring auth')
  .version(pkg.version)
  .option('-o, --output <format>', 'output format (json, table; defaults to json when piped)', (val) => {
    if (!['json', 'table'].includes(val)) {
      throw new InvalidArgumentError('Must be "json" or "table"')
    }
    return val
  }, process.stdout.isTTY ? 'table' : 'json')
  .option('-q, --quiet', 'minimize output (strip empty/zero fields)')
  .option('--vault-id <id>', 'target a specific vault (run "vasig auth status" for IDs)')
  .option('--non-interactive', 'disable all interactive prompts (fail instead of asking)')
  .option('--fields <fields>', 'comma-separated list of fields to include in output')
  .addHelpText('after', '\nExit codes:\n' +
    Object.entries(EXIT_CODE_DESCRIPTIONS).map(([k, v]) => `  ${k}  ${v}`).join('\n'))

// --- Authentication ---
const authGroup = program
  .command('auth')
  .description('[Authentication] Authenticate a vault for agent use')

authGroup
  .command('setup', { isDefault: true })
  .description('Set up vault credentials in system keyring')
  .option('--vault-file <path>', 'path to .vult file (skip discovery)')
  .addHelpText('after', `
Environment variables (for CI/headless environments):
  VAULT_PASSWORD           server signing password (bypasses keyring)
  VAULT_DECRYPT_PASSWORD   vault decryption password (bypasses keyring)

Examples:
  vasig auth setup
  vasig auth setup --vault-file ~/my-vault.vult`)
  .action(async (opts) => {
    const { authSetup } = await import('./commands/auth.js')
    const format = getFormat()
    const { printResult } = await import('./lib/output.js')
    const result = await authSetup({ ...opts, nonInteractive: isNonInteractive() })
    printResult(result, format)
  })

authGroup
  .command('status')
  .description('Show authenticated vaults')
  .action(async () => {
    const { authStatus } = await import('./commands/auth.js')
    const { printResult } = await import('./lib/output.js')
    const result = await authStatus()
    printResult(result, getFormat())
  })

authGroup
  .command('logout')
  .description('Clear stored credentials')
  .option('--vault-id <id>', 'specific vault to log out')
  .option('--all', 'log out all vaults')
  .action(async (opts) => {
    const { authLogout } = await import('./commands/auth.js')
    const { printResult } = await import('./lib/output.js')
    await authLogout(opts)
    printResult({ message: 'Logged out' }, getFormat())
  })

// --- Wallet ---
program
  .command('balance')
  .description('[Wallet] Show vault balances')
  .option('-c, --chain <chain>', 'filter by chain')
  .option('--include-tokens', 'include token balances')
  .option('--fiat', 'show USD values')
  .addHelpText('after', `
Examples:
  vasig balance
  vasig balance --chain Ethereum --include-tokens --fiat
  vasig --output json balance`)
  .action(async (opts) => {
    const { balanceCommand } = await import('./commands/balance.js')
    await balanceCommand(opts, getFormat(), getVaultId())
  })

program
  .command('addresses')
  .description('[Wallet] Show derived addresses for active chains')
  .action(async () => {
    const { addressesCommand } = await import('./commands/addresses.js')
    await addressesCommand(getFormat(), getVaultId())
  })

// --- Trading ---
program
  .command('send')
  .description('[Trading] Send tokens to an address')
  .requiredOption('-c, --chain <chain>', 'blockchain (e.g., Ethereum, Bitcoin)')
  .requiredOption('--to <address>', 'recipient address')
  .requiredOption('--amount <amount>', 'amount to send (or "max")')
  .option('--token <tokenId>', 'token contract address')
  .option('--memo <memo>', 'transaction memo')
  .option('-y, --yes', 'skip confirmation prompt')
  .option('--dry-run', 'validate and preview without sending')
  .addHelpText('after', `
Examples:
  vasig send --chain Ethereum --to 0x1234...abcd --amount 0.1
  vasig send --chain Bitcoin --to bc1q... --amount max --yes
  vasig --output json send --chain Ethereum --to 0x... --amount 0.5 --dry-run`)
  .action(async (opts) => {
    const { sendCommand } = await import('./commands/send.js')
    await sendCommand({ ...opts, nonInteractive: isNonInteractive() }, getFormat(), getVaultId())
  })

const swapGroup = program
  .command('swap')
  .description('[Trading] Token swap operations')

swapGroup
  .command('execute', { isDefault: true })
  .description('Execute a token swap')
  .requiredOption('--from <chain:token>', 'source chain and optional token (e.g., Ethereum or Ethereum:USDC)')
  .requiredOption('--to <chain:token>', 'destination chain and optional token')
  .requiredOption('--amount <amount>', 'amount to swap')
  .option('-y, --yes', 'skip confirmation prompt')
  .option('--dry-run', 'get quote and validate without executing')
  .addHelpText('after', `
Examples:
  vasig swap --from Ethereum --to Bitcoin --amount 0.1
  vasig swap execute --from Ethereum:USDC --to Arbitrum:USDC --amount 100 --yes
  vasig --output json swap --from BSC:BNB --to Ethereum:ETH --amount 0.5 --dry-run`)
  .action(async (opts) => {
    const { swapCommand } = await import('./commands/swap.js')
    await swapCommand({ ...opts, nonInteractive: isNonInteractive() }, getFormat(), getVaultId())
  })

swapGroup
  .command('quote')
  .description('Get a swap quote without executing')
  .requiredOption('--from <chain:token>', 'source chain and optional token')
  .requiredOption('--to <chain:token>', 'destination chain and optional token')
  .requiredOption('--amount <amount>', 'amount to swap')
  .addHelpText('after', `
Examples:
  vasig swap quote --from Ethereum --to Bitcoin --amount 0.1
  vasig --output json swap quote --from Ethereum:USDC --to Arbitrum:USDC --amount 100`)
  .action(async (opts) => {
    const { swapQuoteCommand } = await import('./commands/swap.js')
    await swapQuoteCommand(opts, getFormat(), getVaultId())
  })

swapGroup
  .command('chains')
  .description('List supported swap chains')
  .action(async () => {
    const { swapChainsCommand } = await import('./commands/swap.js')
    await swapChainsCommand(getFormat(), getVaultId())
  })

// Deprecated aliases for backwards compatibility
program
  .command('swap-quote', { hidden: true })
  .requiredOption('--from <chain:token>', 'source chain and optional token')
  .requiredOption('--to <chain:token>', 'destination chain and optional token')
  .requiredOption('--amount <amount>', 'amount to swap')
  .action(async (opts) => {
    process.stderr.write('Note: "swap-quote" is deprecated. Use "vasig swap quote" instead.\n')
    const { swapQuoteCommand } = await import('./commands/swap.js')
    await swapQuoteCommand(opts, getFormat(), getVaultId())
  })

program
  .command('swap-chains', { hidden: true })
  .action(async () => {
    process.stderr.write('Note: "swap-chains" is deprecated. Use "vasig swap chains" instead.\n')
    const { swapChainsCommand } = await import('./commands/swap.js')
    await swapChainsCommand(getFormat(), getVaultId())
  })

// --- Vault Management ---
program
  .command('vault')
  .description('[Vault Management] Show vault details')
  .option('--list', 'list all authenticated vaults')
  .action(async (opts) => {
    const { vaultCommand } = await import('./commands/vault.js')
    await vaultCommand(opts, getFormat(), getVaultId())
  })

program
  .command('chains')
  .description('[Vault Management] List, add, or remove chains')
  .option('--add <chain>', 'add a chain (e.g., Arbitrum)')
  .option('--remove <chain>', 'remove a chain')
  .option('--add-all', 'enable all supported chains')
  .addHelpText('after', `
Examples:
  vasig chains
  vasig chains --add Arbitrum
  vasig chains --add-all`)
  .action(async (opts) => {
    const { manageChainsCommand } = await import('./commands/chains.js')
    await manageChainsCommand(opts, getFormat(), getVaultId())
  })

program
  .command('tokens')
  .description('[Wallet] Discover and manage tracked tokens')
  .option('--discover', 'auto-discover tokens with balances')
  .option('-c, --chain <chain>', 'chain to operate on')
  .option('--add <contractAddress>', 'add a token by contract address (auto-resolves metadata)')
  .option('--remove <contractAddress>', 'remove a tracked token')
  .option('--clear', 'clear all tracked tokens')
  .option('-y, --yes', 'skip confirmation prompt (required for --clear)')
  .option('--symbol <symbol>', 'token symbol (used with --add, auto-detected if omitted)')
  .option('--decimals <decimals>', 'token decimals (used with --add, auto-detected if omitted)')
  .addHelpText('after', `
Examples:
  vasig tokens --discover --chain Ethereum
  vasig tokens --add 0xdAC17F958D2ee523a2206206994597C13D831ec7 --chain Ethereum
  vasig --output json tokens`)
  .action(async (opts) => {
    const { tokensCommand } = await import('./commands/tokens.js')
    await tokensCommand(opts, getFormat(), getVaultId())
  })

// --- Integration ---
program
  .command('mcp')
  .description('[Integration] Start MCP server for AI agent integration')
  .addHelpText('after', `
The MCP server exposes vault operations as tools for AI agents (e.g. Claude Code).
It communicates via JSON-RPC over stdin/stdout (stdio transport).

Setup:
  claude mcp add vultisig -- vasig mcp

Tools provided:
  get_balances      Get token balances
  get_portfolio     Get balances with USD values
  get_address       Get wallet address for a chain
  vault_info        Show vault details
  supported_chains  List swap-supported chains
  swap_quote        Get a swap quote
  send              Send tokens (with confirmation)
  swap              Swap tokens (with confirmation)`)
  .action(async () => {
    const { startMcpServer } = await import('./mcp/index.js')
    await startMcpServer()
  })

// --- Discovery ---

const COMMAND_META: Record<string, {
  enumValues?: Record<string, string[]>
  responseSchema?: Record<string, string>
}> = {
  balance: {
    responseSchema: { chain: 'string', symbol: 'string', amount: 'string', fiatValue: 'number?', contractAddress: 'string?', decimals: 'number?' },
  },
  addresses: {
    responseSchema: { chain: 'string', address: 'string' },
  },
  send: {
    responseSchema: { txHash: 'string', chain: 'string', explorerUrl: 'string', amount: 'string', to: 'string', symbol: 'string' },
  },
  'swap.execute': {
    responseSchema: { txHash: 'string', chain: 'string', explorerUrl: 'string', approvalTxHash: 'string?' },
  },
  'swap.quote': {
    responseSchema: { fromChain: 'string', fromToken: 'string', toChain: 'string', toToken: 'string', inputAmount: 'string', estimatedOutput: 'string', provider: 'string', estimatedOutputFiat: 'number?', requiresApproval: 'boolean?' },
  },
  'swap.chains': {
    responseSchema: { chain: 'string' },
  },
  vault: {
    responseSchema: { id: 'string', name: 'string', type: 'string', chains: 'string[]', isEncrypted: 'boolean', threshold: 'number', totalSigners: 'number' },
  },
}

const GLOBAL_ENUM_VALUES: Record<string, string[]> = {
  '--output': ['json', 'table'],
}

program
  .command('schema', { hidden: true })
  .description('Output machine-readable command schema')
  .action(() => {
    const schema = {
      name: program.name(),
      version: pkg.version,
      exitCodes: Object.fromEntries(
        Object.entries(EXIT_CODE_DESCRIPTIONS).map(([k, v]) => [String(k), v])
      ),
      globalOptions: program.options
        .filter((o) => !o.hidden)
        .map((o) => ({
          flags: o.flags,
          description: o.description,
          required: !!o.mandatory,
          defaultValue: o.defaultValue,
          ...(GLOBAL_ENUM_VALUES[o.long!] ? { enumValues: GLOBAL_ENUM_VALUES[o.long!] } : {}),
        })),
      commands: program.commands
        .filter((c) => !(c as CommandWithHidden)._hidden)
        .map((c) => {
          const meta = COMMAND_META[c.name()]
          return {
            name: c.name(),
            description: c.description(),
            options: c.options
              .filter((o) => !o.hidden && o.long !== '--help')
              .map((o) => ({
                flags: o.flags,
                description: o.description,
                required: !!o.mandatory,
                defaultValue: o.defaultValue,
                ...(meta?.enumValues?.[o.long!] ? { enumValues: meta.enumValues[o.long!] } : {}),
              })),
            ...(meta?.responseSchema ? { responseSchema: meta.responseSchema } : {}),
            subcommands: c.commands.length
              ? c.commands.map((sub) => {
                  const subMeta = COMMAND_META[`${c.name()}.${sub.name()}`]
                  return {
                    name: sub.name(),
                    description: sub.description(),
                    options: sub.options
                      .filter((o) => !o.hidden && o.long !== '--help')
                      .map((o) => ({
                        flags: o.flags,
                        description: o.description,
                        required: !!o.mandatory,
                      })),
                    ...(subMeta?.responseSchema ? { responseSchema: subMeta.responseSchema } : {}),
                  }
                })
              : undefined,
          }
        }),
    }
    process.stdout.write(JSON.stringify(schema, null, 2) + '\n')
  })

function getFormat(): OutputFormat {
  return program.opts().output as OutputFormat
}

function isQuiet(): boolean {
  return !!program.opts().quiet
}

function getVaultId(): string | undefined {
  return program.opts().vaultId as string | undefined
}

function isNonInteractive(): boolean {
  return !!program.opts().nonInteractive
}

function getFields(): string[] | undefined {
  const raw = program.opts().fields as string | undefined
  return raw ? raw.split(',').map(f => f.trim()).filter(Boolean) : undefined
}

export function getCommandFromArgv(argv: string[] = process.argv.slice(2)): string {
  const optionsWithValue = new Set(['--output', '-o', '--vault-id', '--fields'])
  for (let i = 0; i < argv.length; i++) {
    if (optionsWithValue.has(argv[i])) { i++; continue }
    if (!argv[i].startsWith('-')) return argv[i]
  }
  return '--help'
}

export function getFormatFromArgv(argv: string[] = process.argv): OutputFormat {
  for (const flag of ['--output', '-o']) {
    const idx = argv.indexOf(flag)
    if (idx !== -1 && argv[idx + 1] === 'json') return 'json'
  }
  return 'table'
}

// Suppress Commander's error output (but keep help/version output) and ensure errors throw
// instead of calling process.exit. Must apply to all subcommands since Commander doesn't propagate.
function applyErrorHandling(cmd: Command) {
  cmd.configureOutput({ writeErr: () => {}, outputError: () => {} })
  cmd.exitOverride()
  for (const sub of cmd.commands) {
    applyErrorHandling(sub)
  }
}
applyErrorHandling(program)
program.hook('preAction', () => {
  setQuiet(isQuiet())
  setFields(getFields())
})

async function main() {
  try {
    await program.parseAsync(process.argv)
  } catch (err: unknown) {
    if (err instanceof CommanderError) {
      if (err.exitCode === 0) process.exit(0)
      const format = getFormatFromArgv()
      let message = err.message
      let hint: string | undefined

      if (message === '(outputHelp)') {
        message = 'No command specified.'
        hint = 'Run "vasig --help" for available commands'
      } else if (message.includes('required option')) {
        const cmdName = getCommandFromArgv()
        const cmd = program.commands.find(c => c.name() === cmdName)
        if (cmd) {
          const argv = process.argv.slice(2)
          const missing = cmd.options
            .filter(o => o.mandatory)
            .filter(o => {
              const flags = [o.short, o.long].filter(Boolean)
              return !flags.some(f => argv.includes(f!))
            })
            .map(o => o.flags)
          if (missing.length > 1) {
            message = `Missing required options: ${missing.join(', ')}`
          } else if (missing.length === 1) {
            message = `Missing required option: ${missing[0]}`
          }
        }
        hint = `Run "vasig ${cmdName} --help" for usage`
      } else if (message.includes('unknown option')) {
        hint = `Run "vasig ${getCommandFromArgv()} --help" for valid options`
      } else if (message.includes('unknown command')) {
        const match = message.match(/'([^']+)'/)
        if (match) {
          const names = program.commands.filter(c => !(c as CommandWithHidden)._hidden).map(c => c.name())
          const suggestions = findClosest(match[1], names, 3)
          if (suggestions.length > 0) {
            message = `Unknown command: "${match[1]}". Did you mean: ${suggestions.join(', ')}?`
          }
        }
        hint = 'Run "vasig --help" for available commands'
      }

      const usageErr = new UsageError(message, hint)
      printError(usageErr, format)
      process.exit(ExitCode.USAGE)
    }
    const format = getFormatFromArgv()
    if (err instanceof VasigError) {
      printError(err, format)
      process.exit(err.exitCode)
    }
    if (err instanceof Error && err.message !== '') {
      const classified = classifyError(err)
      printError(classified, format)
      process.exit(classified.exitCode)
    }
    process.exit(ExitCode.USAGE)
  }
}

const isDirectRun = process.argv[1]?.includes('index')
if (isDirectRun) main()
