import * as fs from 'node:fs/promises'
import { Vultisig } from '@vultisig/sdk'
import { loadConfig } from '../auth/config.js'
import { getDecryptionPassword, getServerPassword } from '../auth/credential-store.js'
import { AuthRequiredError } from './errors.js'

export async function createSdkWithVault(vaultId?: string) {
  const config = await loadConfig()

  if (config.vaults.length === 0) {
    throw new AuthRequiredError('No vaults configured. Run vasig auth to set up credentials.')
  }

  const vaultEntry = vaultId
    ? config.vaults.find((v) => v.id === vaultId)
    : config.vaults[0]

  if (!vaultEntry) {
    throw new AuthRequiredError(`Vault ${vaultId} not found. Run vasig auth to set up credentials.`)
  }

  const sdk = new Vultisig({
    onPasswordRequired: async (id: string) => {
      // Try decryption password first (primary use: encrypted vault files)
      // Fall back to server password (fast vaults where server pw = vault pw)
      try {
        return await getDecryptionPassword(id)
      } catch {
        return getServerPassword(id)
      }
    },
  })

  await sdk.initialize()

  const vaultContent = await fs.readFile(vaultEntry.filePath, 'utf-8')
  const vault = await sdk.importVault(vaultContent, undefined)

  return { sdk, vault, vaultEntry }
}
