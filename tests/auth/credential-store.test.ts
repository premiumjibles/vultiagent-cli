import { describe, it, expect, vi, beforeEach, } from 'vitest'

// Mock keytar before importing credential-store
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))

import keytar from 'keytar'
import {
  getServerPassword,
  getDecryptionPassword,
  setServerPassword,
  setDecryptionPassword,
  clearCredentials,
  SERVICE_NAME,
} from '../../src/auth/credential-store.js'
import { AuthRequiredError } from '../../src/lib/errors.js'

const mockedKeytar = vi.mocked(keytar)

describe('credential-store', () => {
  const vaultId = 'vault-abc-123'

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.VAULT_PASSWORD
    delete process.env.VAULT_DECRYPT_PASSWORD
  })

  describe('getServerPassword', () => {
    it('returns keyring value when available', async () => {
      mockedKeytar.getPassword.mockResolvedValue('keyring-pw')
      const result = await getServerPassword(vaultId)
      expect(result).toBe('keyring-pw')
      expect(mockedKeytar.getPassword).toHaveBeenCalledWith(SERVICE_NAME, `${vaultId}/server`)
    })

    it('falls back to VAULT_PASSWORD env var', async () => {
      mockedKeytar.getPassword.mockResolvedValue(null)
      process.env.VAULT_PASSWORD = 'env-pw'
      const result = await getServerPassword(vaultId)
      expect(result).toBe('env-pw')
    })

    it('throws AuthRequiredError when no credential found', async () => {
      mockedKeytar.getPassword.mockResolvedValue(null)
      await expect(getServerPassword(vaultId)).rejects.toThrow(AuthRequiredError)
    })
  })

  describe('getDecryptionPassword', () => {
    it('returns keyring value when available', async () => {
      mockedKeytar.getPassword.mockResolvedValue('decrypt-pw')
      const result = await getDecryptionPassword(vaultId)
      expect(result).toBe('decrypt-pw')
      expect(mockedKeytar.getPassword).toHaveBeenCalledWith(SERVICE_NAME, `${vaultId}/decrypt`)
    })

    it('falls back to VAULT_DECRYPT_PASSWORD env var', async () => {
      mockedKeytar.getPassword.mockResolvedValue(null)
      process.env.VAULT_DECRYPT_PASSWORD = 'env-decrypt'
      const result = await getDecryptionPassword(vaultId)
      expect(result).toBe('env-decrypt')
    })

    it('throws AuthRequiredError when no credential found', async () => {
      mockedKeytar.getPassword.mockResolvedValue(null)
      await expect(getDecryptionPassword(vaultId)).rejects.toThrow(AuthRequiredError)
    })
  })

  describe('setServerPassword', () => {
    it('stores in keyring', async () => {
      await setServerPassword(vaultId, 'my-pw')
      expect(mockedKeytar.setPassword).toHaveBeenCalledWith(SERVICE_NAME, `${vaultId}/server`, 'my-pw')
    })
  })

  describe('setDecryptionPassword', () => {
    it('stores in keyring', async () => {
      await setDecryptionPassword(vaultId, 'my-decrypt')
      expect(mockedKeytar.setPassword).toHaveBeenCalledWith(SERVICE_NAME, `${vaultId}/decrypt`, 'my-decrypt')
    })
  })

  describe('clearCredentials', () => {
    it('deletes both keyring entries', async () => {
      mockedKeytar.deletePassword.mockResolvedValue(true)
      await clearCredentials(vaultId)
      expect(mockedKeytar.deletePassword).toHaveBeenCalledWith(SERVICE_NAME, `${vaultId}/server`)
      expect(mockedKeytar.deletePassword).toHaveBeenCalledWith(SERVICE_NAME, `${vaultId}/decrypt`)
    })
  })
})
