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

  const sdk = new Vultisig({})

  await sdk.initialize()

  const vaultContent = await fs.readFile(vaultEntry.filePath, 'utf-8')

  // Retrieve decryption password from keyring if vault is encrypted
  let password: string | undefined
  try {
    password = await getDecryptionPassword(vaultEntry.id)
  } catch {
    // No decryption password stored — vault may be unencrypted,
    // or for fast vaults try the server password
    try {
      password = await getServerPassword(vaultEntry.id)
    } catch {
      // No password available — pass undefined, SDK will throw if vault is encrypted
    }
  }

  const vault = await sdk.importVault(vaultContent, password)

  // Re-add any extra chains saved in config
  if (vaultEntry.extraChains?.length) {
    for (const chain of vaultEntry.extraChains) {
      if (!vault.chains.includes(chain)) {
        await vault.addChain(chain)
      }
    }
  }

  return { sdk, vault, vaultEntry }
}
