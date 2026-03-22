import { describe, it, expect, vi, beforeEach } from 'vitest'
import { discoverVaultFiles } from '../../src/auth/vault-discovery.js'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

vi.mock('node:fs/promises')
const mockedFs = vi.mocked(fs)

describe('vault-discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds .vult files in standard locations', async () => {
    const home = os.homedir()
    mockedFs.readdir.mockImplementation(async (dirPath) => {
      const dir = String(dirPath)
      if (dir === path.join(home, '.vultisig')) {
        return ['myvault.vult', 'other.txt'] as any
      }
      throw new Error('ENOENT')
    })
    mockedFs.stat.mockResolvedValue({ isFile: () => true } as any)

    const files = await discoverVaultFiles()
    expect(files.length).toBeGreaterThanOrEqual(1)
    expect(files[0]).toContain('.vult')
  })

  it('returns empty array when no vaults found', async () => {
    mockedFs.readdir.mockRejectedValue(new Error('ENOENT'))
    const files = await discoverVaultFiles()
    expect(files).toEqual([])
  })
})
