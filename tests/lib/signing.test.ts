import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signWithRetry } from '../../src/lib/signing.js'

describe('signWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('sig-123')
    const result = await signWithRetry(fn)
    expect(result).toBe('sig-123')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on timeout error then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('MPC session timeout'))
      .mockResolvedValueOnce('sig-retry')

    const promise = signWithRetry(fn)
    await vi.advanceTimersByTimeAsync(15_000)
    const result = await promise

    expect(result).toBe('sig-retry')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on non-timeout error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('invalid key'))
    await expect(signWithRetry(fn)).rejects.toThrow('invalid key')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws after max retries on persistent timeout', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('timeout'))

    const promise = signWithRetry(fn).catch((e) => e)
    await vi.advanceTimersByTimeAsync(15_000)
    const err = await promise

    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('timeout')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
