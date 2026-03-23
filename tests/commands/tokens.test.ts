import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVault = vi.hoisted(() => ({
  chains: ['Ethereum'],
  getTokens: vi.fn().mockReturnValue([]),
}))

vi.mock('../../src/lib/sdk.js', () => ({
  withVault: vi.fn(async (fn) => fn({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
    vaultEntry: { id: 'vault-123', tokens: {} },
  })),
}))

vi.mock('../../src/auth/config.js', () => ({
  persistTokens: vi.fn(),
  removePersistedToken: vi.fn(),
  clearPersistedTokens: vi.fn(),
}))

vi.mock('../../src/lib/tokens.js', () => ({
  discoverAndPersistTokens: vi.fn().mockResolvedValue([]),
}))

vi.mock('@vultisig/sdk', () => ({
  SUPPORTED_CHAINS: ['Ethereum', 'Bitcoin'],
}))

import { tokensCommand } from '../../src/commands/tokens.js'

describe('tokens command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  it('--clear without --yes throws UsageError', async () => {
    await expect(
      tokensCommand({ clear: true }, 'json'),
    ).rejects.toThrow('Pass --yes to confirm')
  })

  it('--clear with --yes succeeds', async () => {
    await expect(
      tokensCommand({ clear: true, yes: true }, 'json'),
    ).resolves.toBeUndefined()
  })
})
