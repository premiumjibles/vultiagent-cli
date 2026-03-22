import * as fs from 'node:fs/promises'
import inquirer from 'inquirer'
import { Vultisig } from '@vultisig/sdk'
import {
  setServerPassword,
  setDecryptionPassword,
  clearCredentials,
  getServerPassword,
} from '../auth/credential-store.js'
import { loadConfig, saveConfig } from '../auth/config.js'
import { discoverVaultFiles } from '../auth/vault-discovery.js'

interface AuthSetupOpts {
  vaultFile?: string
}

export async function authSetup(opts: AuthSetupOpts): Promise<{ vaultId: string; vaultName: string }> {
  let vaultFilePath = opts.vaultFile

  if (!vaultFilePath) {
    const config = await loadConfig()
    const extraDirs = config.vaults.map((v) => v.filePath).filter(Boolean)
    const files = await discoverVaultFiles(extraDirs.map((f) => f.replace(/\/[^/]+$/, '')))

    if (files.length === 0) {
      throw new Error('No .vult files found. Use --vault-file <path> to specify one.')
    }

    if (files.length === 1) {
      vaultFilePath = files[0]
    } else {
      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Select a vault file:',
          choices: files,
        },
      ])
      vaultFilePath = selected
    }
  }

  const vaultContent = await fs.readFile(vaultFilePath!, 'utf-8')

  const sdk = new Vultisig({})
  const isEncrypted = sdk.isVaultEncrypted(vaultContent)

  let decryptPassword: string | undefined
  if (isEncrypted) {
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Enter vault decryption password:',
        mask: '*',
      },
    ])
    decryptPassword = password
  }

  const vault = await sdk.importVault(vaultContent, decryptPassword)

  const { serverPassword } = await inquirer.prompt([
    {
      type: 'password',
      name: 'serverPassword',
      message: 'Enter VultiServer password (for 2-of-2 signing):',
      mask: '*',
    },
  ])

  await setServerPassword(vault.id, serverPassword)
  if (isEncrypted && decryptPassword) {
    await setDecryptionPassword(vault.id, decryptPassword)
  }

  const config = await loadConfig()
  const existing = config.vaults.findIndex((v) => v.id === vault.id)
  const entry = { id: vault.id, name: vault.name, filePath: vaultFilePath! }
  if (existing >= 0) {
    config.vaults[existing] = entry
  } else {
    config.vaults.push(entry)
  }
  await saveConfig(config)

  if (typeof sdk.dispose === 'function') sdk.dispose()

  return { vaultId: vault.id, vaultName: vault.name }
}

export async function authStatus(): Promise<Array<{ id: string; name: string; filePath: string; hasCredentials: boolean }>> {
  const config = await loadConfig()
  const results = []

  for (const vault of config.vaults) {
    let hasCredentials = false
    try {
      await getServerPassword(vault.id)
      hasCredentials = true
    } catch {
      // no credentials
    }
    results.push({ ...vault, hasCredentials })
  }

  return results
}

export async function authLogout(opts: { vaultId?: string; all?: boolean }): Promise<void> {
  const config = await loadConfig()

  if (opts.all) {
    for (const vault of config.vaults) {
      await clearCredentials(vault.id)
    }
    config.vaults = []
  } else if (opts.vaultId) {
    await clearCredentials(opts.vaultId)
    config.vaults = config.vaults.filter((v) => v.id !== opts.vaultId)
  }

  await saveConfig(config)
}
