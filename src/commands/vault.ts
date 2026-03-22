import { loadConfig } from '../auth/config.js'
import { createSdkWithVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import type { OutputFormat } from '../lib/output.js'
import type { VaultInfoResult } from '../types.js'

export async function listVaults(): Promise<Array<{ id: string; name: string; filePath: string }>> {
  const config = await loadConfig()
  return config.vaults
}

export async function getVaultInfo(): Promise<VaultInfoResult> {
  const { sdk, vault } = await createSdkWithVault()

  try {
    return {
      id: vault.id,
      name: vault.name,
      type: vault.type,
      chains: [...vault.chains],
      isEncrypted: vault.isEncrypted,
      threshold: vault.threshold,
      totalSigners: vault.totalSigners,
    }
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
}

export async function vaultsCommand(format: OutputFormat): Promise<void> {
  const result = await listVaults()
  printResult(result, format)
}

export async function vaultInfoCommand(format: OutputFormat): Promise<void> {
  const result = await getVaultInfo()
  printResult(result, format)
}
