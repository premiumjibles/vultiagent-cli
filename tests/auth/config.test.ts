import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadConfig, saveConfig, type VasigConfig } from '../../src/auth/config.js'
import * as fs from 'node:fs/promises'

vi.mock('node:fs/promises')
const mockedFs = vi.mocked(fs)

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadConfig returns default when file missing', async () => {
    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'))
    const config = await loadConfig()
    expect(config).toEqual({ vaults: [] })
  })

  it('loadConfig parses existing config', async () => {
    const existing: VasigConfig = {
      vaults: [{ id: 'v1', name: 'MyVault', filePath: '/path/to/vault.vult' }],
    }
    mockedFs.readFile.mockResolvedValue(JSON.stringify(existing))
    const config = await loadConfig()
    expect(config.vaults).toHaveLength(1)
    expect(config.vaults[0].id).toBe('v1')
  })

  it('saveConfig writes JSON to disk', async () => {
    mockedFs.mkdir.mockResolvedValue(undefined)
    mockedFs.writeFile.mockResolvedValue()
    const config: VasigConfig = {
      vaults: [{ id: 'v1', name: 'Test', filePath: '/test.vult' }],
    }
    await saveConfig(config)
    expect(mockedFs.writeFile).toHaveBeenCalled()
    const written = JSON.parse(mockedFs.writeFile.mock.calls[0][1] as string)
    expect(written.vaults[0].id).toBe('v1')
  })
})
