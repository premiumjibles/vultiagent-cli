#!/usr/bin/env node
import { Command, CommanderError } from 'commander'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { VasigError, ExitCode } from './lib/errors.js'
import { printError } from './lib/output.js'
import type { OutputFormat } from './lib/output.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))

const program = new Command()

program
  .name('vasig')
  .description('Agent-friendly Vultisig CLI with keyring auth')
  .version(pkg.version)
  .option('--output <format>', 'output format (json, table)', 'table')

// --- Authentication ---
const authGroup = program
  .command('auth')
  .description('[Authentication] Authenticate a vault for agent use')

authGroup
  .command('setup', { isDefault: true })
  .description('Set up vault credentials in system keyring')
  .option('--vault-file <path>', 'path to .vult file (skip discovery)')
  .action(async (opts) => {
    const { authSetup } = await import('./commands/auth.js')
    const format = getFormat()
    const { printResult } = await import('./lib/output.js')
    const result = await authSetup(opts)
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
  .option('--chain <chain>', 'filter by chain')
  .option('--include-tokens', 'include token balances')
  .option('--fiat', 'show USD values')
  .action(async (opts) => {
    const { balanceCommand } = await import('./commands/balance.js')
    await balanceCommand(opts, getFormat())
  })

program
  .command('addresses')
  .description('[Wallet] Show derived addresses for active chains')
  .action(async () => {
    const { addressesCommand } = await import('./commands/addresses.js')
    await addressesCommand(getFormat())
  })

// --- Trading ---
program
  .command('send')
  .description('[Trading] Send tokens to an address')
  .requiredOption('--chain <chain>', 'blockchain (e.g., Ethereum, Bitcoin)')
  .requiredOption('--to <address>', 'recipient address')
  .requiredOption('--amount <amount>', 'amount to send (or "max")')
  .option('--token <tokenId>', 'token contract address')
  .option('--memo <memo>', 'transaction memo')
  .option('--yes', 'skip confirmation prompt')
  .action(async (opts) => {
    const { sendCommand } = await import('./commands/send.js')
    await sendCommand(opts, getFormat())
  })

program
  .command('swap')
  .description('[Trading] Execute a token swap')
  .requiredOption('--from <chain:token>', 'source chain and optional token (e.g., Ethereum or Ethereum:USDC)')
  .requiredOption('--to <chain:token>', 'destination chain and optional token')
  .requiredOption('--amount <amount>', 'amount to swap')
  .option('--yes', 'skip confirmation prompt')
  .action(async (opts) => {
    const { swapCommand } = await import('./commands/swap.js')
    await swapCommand(opts, getFormat())
  })

program
  .command('swap-quote')
  .description('[Trading] Get a swap quote without executing')
  .requiredOption('--from <chain:token>', 'source chain and optional token')
  .requiredOption('--to <chain:token>', 'destination chain and optional token')
  .requiredOption('--amount <amount>', 'amount to swap')
  .action(async (opts) => {
    const { swapQuoteCommand } = await import('./commands/swap.js')
    await swapQuoteCommand(opts, getFormat())
  })

program
  .command('swap-chains')
  .description('[Trading] List supported swap chains')
  .action(async () => {
    const { swapChainsCommand } = await import('./commands/swap.js')
    await swapChainsCommand(getFormat())
  })

// --- Vault Management ---
program
  .command('vaults')
  .description('[Vault Management] List authenticated vaults')
  .action(async () => {
    const { vaultsCommand } = await import('./commands/vault.js')
    await vaultsCommand(getFormat())
  })

program
  .command('vault-info')
  .description('[Vault Management] Show details of active vault')
  .action(async () => {
    const { vaultInfoCommand } = await import('./commands/vault.js')
    await vaultInfoCommand(getFormat())
  })

program
  .command('chains')
  .description('[Vault Management] List, add, or remove chains')
  .option('--add <chain>', 'add a chain (e.g., Arbitrum)')
  .option('--remove <chain>', 'remove a chain')
  .option('--add-all', 'enable all supported chains')
  .action(async (opts) => {
    const { manageChainsCommand } = await import('./commands/chains.js')
    await manageChainsCommand(opts, getFormat())
  })

program
  .command('tokens')
  .description('[Wallet] Discover and manage tracked tokens')
  .option('--discover', 'auto-discover tokens with balances')
  .option('--chain <chain>', 'chain to operate on')
  .option('--add <contractAddress>', 'add a token by contract address')
  .option('--symbol <symbol>', 'token symbol (used with --add)')
  .option('--decimals <decimals>', 'token decimals (used with --add, default 18)')
  .action(async (opts) => {
    const { tokensCommand } = await import('./commands/tokens.js')
    await tokensCommand(opts, getFormat())
  })

function getFormat(): OutputFormat {
  return program.opts().output as OutputFormat
}

// Global error handler
program.exitOverride()

async function main() {
  try {
    await program.parseAsync(process.argv)
  } catch (err: unknown) {
    if (err instanceof CommanderError && err.exitCode === 0) {
      process.exit(0)
    }
    if (err instanceof VasigError) {
      printError(err, getFormat())
      process.exit(err.exitCode)
    }
    if (err instanceof Error && err.message !== '') {
      printError(err, getFormat())
      process.exit(ExitCode.USAGE)
    }
    process.exit(ExitCode.USAGE)
  }
}

main()
