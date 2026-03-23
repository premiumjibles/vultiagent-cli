import * as fs from 'node:fs/promises'
import { Vultisig } from '@vultisig/sdk'
import { loadConfig } from '../auth/config.js'
import { getDecryptionPassword, getServerPassword } from '../auth/credential-store.js'
import { AuthRequiredError, VasigError, NetworkError, classifyError } from './errors.js'

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

  // Restore persisted tokens
  const persistedTokens = vaultEntry.tokens ?? {}
  for (const [chain, tokens] of Object.entries(persistedTokens)) {
    for (const t of tokens) {
      await vault.addToken(chain, { ...t, name: t.symbol, chainId: chain })
    }
  }

  return { sdk, vault, vaultEntry }
}

export type VaultContext = Awaited<ReturnType<typeof createSdkWithVault>>

export async function suppressConsoleWarn<T>(fn: () => Promise<T>): Promise<T> {
  const origWarn = console.warn
  console.warn = () => {}
  try {
    return await fn()
  } finally {
    console.warn = origWarn
  }
}

export async function withVault<T>(
  fn: (ctx: VaultContext) => Promise<T>,
  vaultId?: string,
): Promise<T> {
  const ctx = await createSdkWithVault(vaultId)
  try {
    return await fn(ctx)
  } catch (err: unknown) {
    if (err instanceof VasigError) throw err
    if (err instanceof Error && (err.message.includes('network') || err.message.includes('timeout'))) {
      throw new NetworkError(err.message)
    }
    if (err instanceof Error) throw classifyError(err)
    throw err
  } finally {
    if (typeof ctx.sdk.dispose === 'function') ctx.sdk.dispose()
  }
}
