import * as fs from 'node:fs/promises'
import { Vultisig } from '@vultisig/sdk'
import { loadConfig } from '../auth/config.js'
import { getDecryptionPassword } from '../auth/credential-store.js'
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
      return getDecryptionPassword(id)
    },
  })

  await sdk.initialize()

  const vaultContent = await fs.readFile(vaultEntry.filePath, 'utf-8')
  const isEncrypted = sdk.isVaultEncrypted(vaultContent)

  let password: string | undefined
  if (isEncrypted) {
    password = await getDecryptionPassword(vaultEntry.id)
  }

  const vault = await sdk.importVault(vaultContent, password)

  return { sdk, vault, vaultEntry }
}
