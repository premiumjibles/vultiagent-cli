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
import { discoverVaultFiles, SEARCH_DIRS } from '../auth/vault-discovery.js'
import { UsageError } from '../lib/errors.js'

interface AuthSetupOpts {
  vaultFile?: string
  nonInteractive?: boolean
}

export async function authSetup(opts: AuthSetupOpts): Promise<{ vaultId: string; vaultName: string }> {
  let vaultFilePath = opts.vaultFile

  if (!vaultFilePath) {
    const config = await loadConfig()
    const extraDirs = config.vaults.map((v) => v.filePath).filter(Boolean)
    const files = await discoverVaultFiles(extraDirs.map((f) => f.replace(/\/[^/]+$/, '')))

    if (files.length === 0) {
      const searched = [...SEARCH_DIRS, process.cwd()].join('\n  - ')
      throw new Error(
        `No .vult files found. Searched:\n  - ${searched}\n\n` +
        'Export your vault from the Vultisig app and place the .vult file in one of these locations,\n' +
        'or specify the path directly: vasig auth --vault-file /path/to/vault.vult'
      )
    }

    if (files.length === 1) {
      vaultFilePath = files[0]
    } else if (!process.stdin.isTTY || opts.nonInteractive) {
      throw new UsageError(
        'Multiple vault files found but no TTY available for selection.',
        'Use --vault-file <path> to specify which vault file to use'
      )
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
  try {
    const isEncrypted = sdk.isVaultEncrypted(vaultContent)

    let vault: Awaited<ReturnType<typeof sdk.importVault>> | undefined
    let decryptPassword: string | undefined

    if (isEncrypted) {
      const envDecryptPw = process.env.VAULT_DECRYPT_PASSWORD
      if (envDecryptPw) {
        try {
          vault = await sdk.importVault(vaultContent, envDecryptPw)
          decryptPassword = envDecryptPw
        } catch {
          throw new UsageError(
            'VAULT_DECRYPT_PASSWORD is set but failed to decrypt the vault.',
            'Check that the password is correct'
          )
        }
      } else if (!process.stdin.isTTY || opts.nonInteractive) {
        throw new UsageError(
          'Vault is encrypted but no TTY available for password prompt.',
          'Set VAULT_DECRYPT_PASSWORD env var for non-interactive usage'
        )
      } else {
        const MAX_ATTEMPTS = 3
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          const { password } = await inquirer.prompt([
            {
              type: 'password',
              name: 'password',
              message: attempt === 1
                ? 'Enter vault file password (the password you chose when exporting/backing up from the Vultisig app — this unlocks the .vult file):'
                : `Wrong password. Try again (attempt ${attempt}/${MAX_ATTEMPTS}):`,
              mask: '*',
            },
          ])
          try {
            vault = await sdk.importVault(vaultContent, password)
            decryptPassword = password
            break
          } catch {
            if (attempt === MAX_ATTEMPTS) {
              throw new UsageError(
                'Failed to decrypt vault after 3 attempts. Check your decryption password.',
                'This is the password you set when exporting the vault from the Vultisig app.'
              )
            }
          }
        }
      }
    } else {
      vault = await sdk.importVault(vaultContent, undefined)
    }

    // vault is guaranteed set — the loop either sets it or throws
    const v = vault!

    let serverPassword: string
    const envServerPw = process.env.VAULT_PASSWORD
    if (envServerPw) {
      serverPassword = envServerPw
    } else if (!process.stdin.isTTY || opts.nonInteractive) {
      throw new UsageError(
        'No TTY available for password prompt.',
        'Set VAULT_PASSWORD env var for non-interactive usage'
      )
    } else {
      const response = await inquirer.prompt([
        {
          type: 'password',
          name: 'serverPassword',
          message: 'Enter VultiServer password (your server signing password, used for 2-of-2 MPC signing with VultiServer):',
          mask: '*',
        },
      ])
      serverPassword = response.serverPassword
    }

    await setServerPassword(v.id, serverPassword)
    if (isEncrypted && decryptPassword) {
      await setDecryptionPassword(v.id, decryptPassword)
    }

    const config = await loadConfig()
    const existing = config.vaults.findIndex((c) => c.id === v.id)
    const entry = { id: v.id, name: v.name, filePath: vaultFilePath! }
    if (existing >= 0) {
      config.vaults[existing] = entry
    } else {
      config.vaults.push(entry)
    }
    await saveConfig(config)

    return { vaultId: v.id, vaultName: v.name }
  } finally {
    if (typeof sdk.dispose === 'function') sdk.dispose()
  }
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
  } else if (config.vaults.length === 1) {
    await clearCredentials(config.vaults[0].id)
    config.vaults = []
  } else if (config.vaults.length > 1) {
    throw new UsageError('Multiple vaults configured. Use --vault-id <id> or --all.', 'Run: vasig auth status')
  } else {
    throw new UsageError('No vaults configured.', 'Run: vasig auth')
  }

  await saveConfig(config)
}
