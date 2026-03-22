import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockVault = vi.hoisted(() => ({
  id: 'vault-123',
  name: 'TestVault',
  isEncrypted: false,
  address: vi.fn().mockResolvedValue('0xSenderAddress'),
  balance: vi.fn().mockResolvedValue({ decimals: 18, symbol: 'ETH', chain: 'Ethereum' }),
  getMaxSendAmount: vi.fn().mockResolvedValue({ maxSendable: 1000000000000000000n }),
  prepareSendTx: vi.fn().mockResolvedValue({ coin: { chain: 'Ethereum' } }),
  extractMessageHashes: vi.fn().mockResolvedValue(['0xhash1']),
  sign: vi.fn().mockResolvedValue({ signature: '0xsig', recovery: 0, format: 'ecdsa' }),
  broadcastTx: vi.fn().mockResolvedValue('0xtxhash123'),
  gas: vi.fn().mockResolvedValue({ fast: '21000', price: '50' }),
  on: vi.fn(),
  removeAllListeners: vi.fn(),
  isUnlocked: vi.fn().mockReturnValue(true),
}))

vi.mock('../../src/lib/sdk.js', () => ({
  createSdkWithVault: vi.fn().mockResolvedValue({
    sdk: { dispose: vi.fn() },
    vault: mockVault,
  }),
}))

vi.mock('@vultisig/sdk', () => ({
  Vultisig: { getTxExplorerUrl: vi.fn().mockReturnValue('https://etherscan.io/tx/0xtxhash123') },
}))

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue('server-pw'),
    setPassword: vi.fn(),
    deletePassword: vi.fn(),
  },
}))

import { executeSend } from '../../src/commands/send.js'

describe('send command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends a transaction with --yes flag', async () => {
    const result = await executeSend({
      chain: 'Ethereum',
      to: '0xRecipient',
      amount: '1.0',
      yes: true,
    })

    expect(result.txHash).toBe('0xtxhash123')
    expect(result.chain).toBe('Ethereum')
    expect(mockVault.prepareSendTx).toHaveBeenCalled()
    expect(mockVault.sign).toHaveBeenCalled()
    expect(mockVault.broadcastTx).toHaveBeenCalled()
  })

  it('sends max amount when amount is "max"', async () => {
    await executeSend({
      chain: 'Ethereum',
      to: '0xRecipient',
      amount: 'max',
      yes: true,
    })

    expect(mockVault.getMaxSendAmount).toHaveBeenCalled()
    expect(mockVault.prepareSendTx).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000000000000000000n })
    )
  })
})
