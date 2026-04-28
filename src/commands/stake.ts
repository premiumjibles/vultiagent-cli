/**
 * Cosmos staking module commands (read-only).
 *
 * Wraps the SDK's generic cosmos staking LCD helpers (delegations, rewards,
 * unbonding, vesting accounts) in CLI-shaped output. Works for any cosmos
 * chain we support (Cosmos Hub, Osmosis, Kujira, Terra, Akash, Noble, Dydx).
 *
 * Write-side commands (delegate / undelegate / redelegate / withdraw-rewards)
 * are intentionally NOT in this PR -- they need a higher-level
 * `vault.prepareCosmosStakingTx` orchestration helper in the SDK that lands
 * separately. Read commands are useful on their own and exercise the new
 * SDK staking primitives end-to-end against real LCD endpoints.
 */
import {
  type Delegation,
  type DelegatorRewardsResponse,
  type UnbondingDelegation,
  type VestingAccount,
  getCosmosDelegations,
  getCosmosDelegatorRewards,
  getCosmosUnbondingDelegations,
  getCosmosVestingAccount,
} from '@vultisig/sdk'

import type { OutputFormat } from '../lib/output.js'
import { printResult } from '../lib/output.js'
import { withVault } from '../lib/sdk.js'
import { resolveChain } from '../lib/validation.js'

interface StakeReadOpts {
  chain: string
}

export type StakeDelegationsResult = {
  chain: string
  address: string
  delegations: Delegation[]
  totalStaked: { denom: string; amount: string } | null
}

export async function getStakeDelegations(opts: StakeReadOpts, vaultId?: string): Promise<StakeDelegationsResult> {
  const chain = resolveChain(opts.chain)
  return withVault(async ({ vault }) => {
    const address = await vault.address(chain)
    // SDK enforces IbcEnabledCosmosChain at the type level; cast here is the
    // narrowing point for the CLI's looser Chain type.
    const delegations = await getCosmosDelegations(chain as Parameters<typeof getCosmosDelegations>[0], address)
    const totalStaked = sumByDenom(delegations.map(d => d.balance))
    return { chain: String(chain), address, delegations, totalStaked }
  }, vaultId)
}

export type StakeRewardsResult = {
  chain: string
  address: string
  rewards: DelegatorRewardsResponse['rewards']
  total: DelegatorRewardsResponse['total']
}

export async function getStakeRewards(opts: StakeReadOpts, vaultId?: string): Promise<StakeRewardsResult> {
  const chain = resolveChain(opts.chain)
  return withVault(async ({ vault }) => {
    const address = await vault.address(chain)
    const result = await getCosmosDelegatorRewards(chain as Parameters<typeof getCosmosDelegatorRewards>[0], address)
    return { chain: String(chain), address, rewards: result.rewards, total: result.total }
  }, vaultId)
}

export type StakeUnbondingResult = {
  chain: string
  address: string
  unbondings: UnbondingDelegation[]
  pendingTotal: { denom: string; amount: string } | null
}

export async function getStakeUnbonding(opts: StakeReadOpts, vaultId?: string): Promise<StakeUnbondingResult> {
  const chain = resolveChain(opts.chain)
  return withVault(async ({ vault }) => {
    const address = await vault.address(chain)
    const unbondings = await getCosmosUnbondingDelegations(
      chain as Parameters<typeof getCosmosUnbondingDelegations>[0],
      address
    )
    // Sum entry balances (un-bonding amounts pending after the unbond window).
    // The denom isn't reported on the entry directly — it matches the chain's
    // stake denom, which the caller can derive from the chain config.
    const totalAmount = unbondings
      .flatMap(u => u.entries)
      .reduce((acc, e) => acc + BigInt(e.balance), 0n)
    const pendingTotal = totalAmount > 0n ? { denom: '', amount: totalAmount.toString() } : null
    return { chain: String(chain), address, unbondings, pendingTotal }
  }, vaultId)
}

export type StakeVestingResult = {
  chain: string
  address: string
  vestingAccount: VestingAccount | null
  isVesting: boolean
}

export async function getStakeVesting(opts: StakeReadOpts, vaultId?: string): Promise<StakeVestingResult> {
  const chain = resolveChain(opts.chain)
  return withVault(async ({ vault }) => {
    const address = await vault.address(chain)
    const vestingAccount = await getCosmosVestingAccount(
      chain as Parameters<typeof getCosmosVestingAccount>[0],
      address
    )
    return { chain: String(chain), address, vestingAccount, isVesting: vestingAccount !== null }
  }, vaultId)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sumByDenom(coins: Array<{ denom: string; amount: string }>): { denom: string; amount: string } | null {
  if (coins.length === 0) return null
  // All delegations on a single chain are denominated in the chain's stake
  // denom — sum them naively. If for some reason the response had mixed
  // denoms we'd need a multi-denom return shape.
  const total = coins.reduce((acc, c) => acc + BigInt(c.amount), 0n)
  return { denom: coins[0].denom, amount: total.toString() }
}

// ---------------------------------------------------------------------------
// CLI command wrappers
// ---------------------------------------------------------------------------

export async function stakeDelegationsCommand(
  opts: StakeReadOpts,
  format: OutputFormat,
  vaultId?: string
): Promise<void> {
  const result = await getStakeDelegations(opts, vaultId)
  printResult(result, format)
}

export async function stakeRewardsCommand(opts: StakeReadOpts, format: OutputFormat, vaultId?: string): Promise<void> {
  const result = await getStakeRewards(opts, vaultId)
  printResult(result, format)
}

export async function stakeUnbondingCommand(
  opts: StakeReadOpts,
  format: OutputFormat,
  vaultId?: string
): Promise<void> {
  const result = await getStakeUnbonding(opts, vaultId)
  printResult(result, format)
}

export async function stakeVestingCommand(opts: StakeReadOpts, format: OutputFormat, vaultId?: string): Promise<void> {
  const result = await getStakeVesting(opts, vaultId)
  printResult(result, format)
}
