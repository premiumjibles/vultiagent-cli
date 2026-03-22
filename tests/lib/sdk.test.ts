import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue('keyring-password'),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn() }
})

const mockVault = {
  id: 'vault-123',
  name: 'TestVault',
  type: 'fast',
  isEncrypted: true,
  chains: ['Ethereum'],
}

vi.mock('@vultisig/sdk', () => ({
  Vultisig: vi.fn().mockImplementation((opts: any) => ({
    initialize: vi.fn(),
    importVault: vi.fn().mockResolvedValue(mockVault),
    isVaultEncrypted: vi.fn().mockReturnValue(true),
    dispose: vi.fn(),
    _onPasswordRequired: opts?.onPasswordRequired,
  })),
}))

import * as fs from 'node:fs/promises'
import { createSdkWithVault } from '../../src/lib/sdk.js'

const mockedFs = vi.mocked(fs)

describe('sdk helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates SDK and imports vault from config', async () => {
    mockedFs.readFile.mockImplementation(async (path) => {
      if (String(path).endsWith('config.json')) {
        return JSON.stringify({
          vaults: [{ id: 'vault-123', name: 'TestVault', filePath: '/test.vult' }],
        })
      }
      return 'vault-file-content'
    })

    const { sdk, vault } = await createSdkWithVault()
    expect(vault.id).toBe('vault-123')
  })

  it('throws when no vaults configured', async () => {
    mockedFs.readFile.mockImplementation(async (path) => {
      if (String(path).endsWith('config.json')) {
        return JSON.stringify({ vaults: [] })
      }
      throw new Error('ENOENT')
    })

    await expect(createSdkWithVault()).rejects.toThrow()
  })
})
