import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockVault } = vi.hoisted(() => ({
  mockVault: {
    id: 'vault-123',
    name: 'TestVault',
    type: 'fast',
    chains: ['Ethereum', 'Bitcoin'],
    isEncrypted: true,
    threshold: 2,
    totalSigners: 2,
  },
}))

vi.mock('../../src/lib/sdk.js', () => ({
  withVault: vi.fn(async (fn) => fn({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
    vaultEntry: { id: 'vault-123', name: 'TestVault', filePath: '/test.vult' },
  })),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn() }
})

vi.mock('keytar', () => ({
  default: { getPassword: vi.fn().mockResolvedValue('pw'), setPassword: vi.fn(), deletePassword: vi.fn() },
}))

import * as fs from 'node:fs/promises'
import { listVaults, getVaultInfo } from '../../src/commands/vault.js'

const mockedFs = vi.mocked(fs)

describe('vault commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listVaults', () => {
    it('returns configured vaults from config', async () => {
      mockedFs.readFile.mockResolvedValue(JSON.stringify({
        vaults: [
          { id: 'v1', name: 'Vault1', filePath: '/a.vult' },
          { id: 'v2', name: 'Vault2', filePath: '/b.vult' },
        ],
      }))

      const result = await listVaults()
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('Vault1')
    })
  })

  describe('getVaultInfo', () => {
    it('returns detailed vault info', async () => {
      const result = await getVaultInfo()
      expect(result.id).toBe('vault-123')
      expect(result.name).toBe('TestVault')
      expect(result.type).toBe('fast')
      expect(result.chains).toEqual(['Ethereum', 'Bitcoin'])
      expect(result.isEncrypted).toBe(true)
      expect(result.threshold).toBe(2)
    })
  })
})
