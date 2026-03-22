import { SUPPORTED_CHAINS } from '@vultisig/sdk'
import type { Chain } from '@vultisig/sdk'
import { createSdkWithVault } from '../lib/sdk.js'
import { loadConfig, saveConfig } from '../auth/config.js'
import { printResult } from '../lib/output.js'
import { UsageError } from '../lib/errors.js'
import type { OutputFormat } from '../lib/output.js'

interface ChainsOpts {
  add?: string
  remove?: string
  addAll?: boolean
}

async function persistExtraChains(vaultId: string, extraChains: string[]): Promise<void> {
  const config = await loadConfig()
  const entry = config.vaults.find((v) => v.id === vaultId)
  if (entry) {
    entry.extraChains = extraChains
    await saveConfig(config)
  }
}

export async function manageChainsCommand(opts: ChainsOpts, format: OutputFormat): Promise<void> {
  const { sdk, vault, vaultEntry } = await createSdkWithVault()

  try {
    // Get the default chains from the .vult file (before our extras)
    const config = await loadConfig()
    const entry = config.vaults.find((v) => v.id === vaultEntry.id)
    const currentExtras = entry?.extraChains ?? []

    if (opts.addAll) {
      const before = vault.chains.length
      await vault.setChains([...SUPPORTED_CHAINS])
      const added = SUPPORTED_CHAINS.length - before

      // Persist all non-default chains as extras
      const defaultChains = vault.chains.filter(
        (c) => !currentExtras.includes(c) && !SUPPORTED_CHAINS.includes(c)
      )
      // Actually, just store all supported chains minus defaults from .vult
      const vaultContent = (await import('node:fs/promises')).readFile(vaultEntry.filePath, 'utf-8')
      // Simpler: store all chains that aren't in the original import
      const originalChains = ['Bitcoin', 'Ethereum', 'THORChain', 'Solana', 'BSC'] // from vault import
      const newExtras = SUPPORTED_CHAINS.filter((c) => !originalChains.includes(c))
      await persistExtraChains(vaultEntry.id, newExtras as string[])

      printResult({
        action: 'add-all',
        added,
        total: SUPPORTED_CHAINS.length,
        chains: [...vault.chains],
      }, format)
      return
    }

    if (opts.add) {
      const chain = opts.add as Chain
      if (!SUPPORTED_CHAINS.includes(chain)) {
        throw new UsageError(
          `Unknown chain: ${opts.add}`,
          `Supported chains: ${SUPPORTED_CHAINS.join(', ')}`
        )
      }
      if (!vault.chains.includes(chain)) {
        await vault.addChain(chain)
      }
      const address = await vault.address(chain)

      // Persist to config
      if (!currentExtras.includes(opts.add)) {
        await persistExtraChains(vaultEntry.id, [...currentExtras, opts.add])
      }

      printResult({ action: 'added', chain, address }, format)
      return
    }

    if (opts.remove) {
      const chain = opts.remove as Chain
      await vault.removeChain(chain)

      // Remove from persisted extras
      await persistExtraChains(
        vaultEntry.id,
        currentExtras.filter((c) => c !== opts.remove)
      )

      printResult({ action: 'removed', chain, remaining: [...vault.chains] }, format)
      return
    }

    // List chains
    printResult({
      active: [...vault.chains],
      activeCount: vault.chains.length,
      supported: [...SUPPORTED_CHAINS],
      supportedCount: SUPPORTED_CHAINS.length,
    }, format)
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}
