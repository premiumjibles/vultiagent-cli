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
import { createSdkWithVault, withVault } from '../../src/lib/sdk.js'
import { UsageError, NetworkError, InvalidAddressError } from '../../src/lib/errors.js'

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

describe('withVault', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedFs.readFile.mockImplementation(async (path) => {
      if (String(path).endsWith('config.json')) {
        return JSON.stringify({
          vaults: [{ id: 'vault-123', name: 'TestVault', filePath: '/test.vult' }],
        })
      }
      return 'vault-file-content'
    })
  })

  it('returns the value from the callback', async () => {
    const result = await withVault(async ({ vault }) => vault.id)
    expect(result).toBe('vault-123')
  })

  it('passes through VasigError unchanged', async () => {
    const err = new UsageError('bad input')
    await expect(
      withVault(async () => { throw err })
    ).rejects.toBe(err)
  })

  it('wraps network errors as NetworkError', async () => {
    await expect(
      withVault(async () => { throw new Error('network timeout') })
    ).rejects.toBeInstanceOf(NetworkError)
  })

  it('wraps timeout errors as NetworkError', async () => {
    await expect(
      withVault(async () => { throw new Error('connection timeout') })
    ).rejects.toBeInstanceOf(NetworkError)
  })

  it('classifies unknown errors via classifyError', async () => {
    await expect(
      withVault(async () => { throw new Error('invalid address format') })
    ).rejects.toBeInstanceOf(InvalidAddressError)
  })

  it('rethrows non-Error values as-is', async () => {
    await expect(
      withVault(async () => { throw 'raw string' })
    ).rejects.toBe('raw string')
  })
})
