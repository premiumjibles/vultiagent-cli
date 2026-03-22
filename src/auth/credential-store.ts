import keytar from 'keytar'
import { AuthRequiredError } from '../lib/errors.js'

export const SERVICE_NAME = 'vultisig'

export async function getServerPassword(vaultId: string): Promise<string> {
  const fromKeyring = await keytar.getPassword(SERVICE_NAME, `${vaultId}/server`)
  if (fromKeyring) return fromKeyring

  const fromEnv = process.env.VAULT_PASSWORD
  if (fromEnv) return fromEnv

  throw new AuthRequiredError()
}

export async function getDecryptionPassword(vaultId: string): Promise<string> {
  const fromKeyring = await keytar.getPassword(SERVICE_NAME, `${vaultId}/decrypt`)
  if (fromKeyring) return fromKeyring

  const fromEnv = process.env.VAULT_DECRYPT_PASSWORD
  if (fromEnv) return fromEnv

  throw new AuthRequiredError()
}

export async function setServerPassword(vaultId: string, password: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, `${vaultId}/server`, password)
}

export async function setDecryptionPassword(vaultId: string, password: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, `${vaultId}/decrypt`, password)
}

export async function clearCredentials(vaultId: string): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, `${vaultId}/server`)
  await keytar.deletePassword(SERVICE_NAME, `${vaultId}/decrypt`)
}
