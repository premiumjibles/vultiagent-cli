import { SUPPORTED_CHAINS } from '@vultisig/sdk'
import { withVault } from '../lib/sdk.js'
import { loadConfig, saveConfig } from '../auth/config.js'
import { printResult } from '../lib/output.js'
import { InvalidChainError } from '../lib/errors.js'
import { resolveChain } from '../lib/validation.js'
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

export async function manageChainsCommand(opts: ChainsOpts, format: OutputFormat, vaultId?: string): Promise<void> {
  return withVault(async ({ vault, vaultEntry }) => {
    // Get the default chains from the .vult file (before our extras)
    const config = await loadConfig()
    const entry = config.vaults.find((v) => v.id === vaultEntry.id)
    const currentExtras = entry?.extraChains ?? []

    if (opts.addAll) {
      const originalChains = [...vault.chains]
      await vault.setChains([...SUPPORTED_CHAINS])
      const added = SUPPORTED_CHAINS.length - originalChains.length
      const newExtras = SUPPORTED_CHAINS.filter((c) => !originalChains.includes(c))
      const mergedExtras = [...new Set([...currentExtras, ...newExtras.map(String)])]
      await persistExtraChains(vaultEntry.id, mergedExtras)

      printResult({
        action: 'add-all',
        added,
        total: SUPPORTED_CHAINS.length,
        chains: [...vault.chains],
      }, format)
      return
    }

    if (opts.add) {
      const chain = resolveChain(opts.add)
      const alreadyActive = vault.chains.includes(chain)
      if (alreadyActive) {
        const address = await vault.address(chain)
        printResult({ action: 'already-active', chain, address }, format)
        return
      }
      await vault.addChain(chain)
      const address = await vault.address(chain)

      // Persist to config
      if (!currentExtras.includes(String(chain))) {
        await persistExtraChains(vaultEntry.id, [...currentExtras, String(chain)])
      }

      printResult({ action: 'added', chain, address }, format)
      return
    }

    if (opts.remove) {
      const chain = resolveChain(opts.remove)
      if (!vault.chains.includes(chain)) {
        throw new InvalidChainError(
          `Chain ${chain} is not active on this vault`,
          `Run "vasig chains" to see active chains`
        )
      }
      await vault.removeChain(chain)

      // Remove from persisted extras
      await persistExtraChains(
        vaultEntry.id,
        currentExtras.filter((c) => c !== String(chain))
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
  }, vaultId)
}
