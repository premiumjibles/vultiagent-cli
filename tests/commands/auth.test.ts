import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn(), readdir: vi.fn(), stat: vi.fn() }
})

vi.mock('inquirer', () => ({
  default: { prompt: vi.fn() },
}))

vi.mock('@vultisig/sdk', () => ({
  Vultisig: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    importVault: vi.fn().mockResolvedValue({
      id: 'vault-123',
      name: 'TestVault',
      type: 'fast',
      isEncrypted: false,
      chains: ['Ethereum', 'Bitcoin'],
    }),
    isVaultEncrypted: vi.fn().mockReturnValue(false),
    dispose: vi.fn(),
  })),
}))

import keytar from 'keytar'
import inquirer from 'inquirer'
import * as fs from 'node:fs/promises'
import { authSetup, authStatus, authLogout } from '../../src/commands/auth.js'

const mockedKeytar = vi.mocked(keytar)
const mockedInquirer = vi.mocked(inquirer)
const mockedFs = vi.mocked(fs)

describe('auth commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('authSetup', () => {
    it('imports unencrypted vault and stores server password', async () => {
      mockedFs.readFile.mockResolvedValue('vault-file-content')
      mockedInquirer.prompt
        .mockResolvedValueOnce({ serverPassword: 'server-pass' })

      const result = await authSetup({ vaultFile: '/path/vault.vult' })

      expect(result.vaultId).toBe('vault-123')
      expect(result.vaultName).toBe('TestVault')
      expect(mockedKeytar.setPassword).toHaveBeenCalledWith(
        'vultisig', 'vault-123/server', 'server-pass'
      )
    })
  })

  describe('authStatus', () => {
    it('returns configured vaults from config', async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify({
        vaults: [{ id: 'v1', name: 'Vault1', filePath: '/test.vult' }],
      }))
      mockedKeytar.getPassword.mockResolvedValue('exists')

      const result = await authStatus()
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Vault1')
      expect(result[0].hasCredentials).toBe(true)
    })
  })

  describe('authLogout', () => {
    it('clears credentials for a specific vault', async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify({
        vaults: [{ id: 'v1', name: 'Vault1', filePath: '/test.vult' }],
      }))
      mockedFs.mkdir.mockResolvedValue(undefined)
      mockedFs.writeFile.mockResolvedValue()
      mockedKeytar.deletePassword.mockResolvedValue(true)

      await authLogout({ vaultId: 'v1' })
      expect(mockedKeytar.deletePassword).toHaveBeenCalledWith('vultisig', 'v1/server')
      expect(mockedKeytar.deletePassword).toHaveBeenCalledWith('vultisig', 'v1/decrypt')
    })
  })
})
