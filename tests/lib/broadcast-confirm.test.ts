/**
 * P0-7: assertBroadcastConfirmed regression suite.
 *
 * Before this gate existed, a valid-payload + non-risky send/swap would
 * broadcast immediately in every environment. Non-TTY contexts (CI, pipe,
 * agent-driven shells) had no human-intent signal between "parse CLI args"
 * and "sign + broadcast on-chain."
 *
 * These tests lock down the matrix:
 *
 *                         no flag    --dry-run     --yes
 *   human TTY            prompt     skip          skip
 *   non-TTY / --non-int  ERROR      skip          skip
 *
 * `--yes` and `--dry-run` MUST both short-circuit without importing
 * inquirer — agent-driven invocations must not pay confirm latency.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { assertBroadcastConfirmed } from '../../src/lib/validation.js'
import { UsageError } from '../../src/lib/errors.js'

const promptMock = vi.fn()
vi.mock('inquirer', () => ({
  default: { prompt: (...args: unknown[]) => promptMock(...args) },
}))

describe('assertBroadcastConfirmed', () => {
  const originalTTY = process.stdin.isTTY

  beforeEach(() => {
    promptMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalTTY, configurable: true })
  })

  it('short-circuits with --yes (never prompts, never errors)', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    await expect(
      assertBroadcastConfirmed({ yes: true }, 'Send 1 ETH to 0x1234?'),
    ).resolves.toBeUndefined()
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('short-circuits with --dry-run (never prompts, never errors)', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    await expect(
      assertBroadcastConfirmed({ dryRun: true }, 'Send 1 ETH to 0x1234?'),
    ).resolves.toBeUndefined()
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('short-circuits when both --yes and --dry-run are set (--yes wins)', async () => {
    await expect(
      assertBroadcastConfirmed({ yes: true, dryRun: true }, 'Send 1 ETH?'),
    ).resolves.toBeUndefined()
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('throws UsageError in non-TTY without --yes or --dry-run (P0-7 core guard)', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    await expect(
      assertBroadcastConfirmed({}, 'Send 1 ETH to 0x1234?'),
    ).rejects.toThrow(UsageError)
    await expect(
      assertBroadcastConfirmed({}, 'Send 1 ETH to 0x1234?'),
    ).rejects.toThrow(/Refusing to broadcast without explicit intent/)
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('throws UsageError when --non-interactive is set, even on a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    await expect(
      assertBroadcastConfirmed({ nonInteractive: true }, 'Send 1 ETH?'),
    ).rejects.toThrow(/non-interactive mode/)
    expect(promptMock).not.toHaveBeenCalled()
  })

  it('prompts on a TTY and proceeds on confirm:true', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    promptMock.mockResolvedValueOnce({ confirmed: true })
    await expect(
      assertBroadcastConfirmed({}, 'Send 0.1 ETH on Ethereum to 0x9D7C40...3003?'),
    ).resolves.toBeUndefined()
    expect(promptMock).toHaveBeenCalledTimes(1)
    expect(promptMock).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'confirm',
        name: 'confirmed',
        message: 'Send 0.1 ETH on Ethereum to 0x9D7C40...3003?',
        default: false,
      }),
    ])
  })

  it('prompts on a TTY and throws Cancelled on confirm:false', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    promptMock.mockResolvedValueOnce({ confirmed: false })
    await expect(
      assertBroadcastConfirmed({}, 'Send 0.1 ETH?'),
    ).rejects.toThrow(/Cancelled/)
  })
})

