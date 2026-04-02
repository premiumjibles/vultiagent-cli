import { describe, it, expect } from 'vitest'
import {
  UsageError,
  AuthRequiredError,
  NetworkError,
  ExitCode,
  EXIT_CODE_DESCRIPTIONS,
  toErrorJson,
  cleanSdkMessage,
} from '../../src/lib/errors.js'

describe('error types', () => {
  it('UsageError has exit code 1', () => {
    const err = new UsageError('bad argument')
    expect(err.exitCode).toBe(ExitCode.USAGE)
    expect(err.code).toBe('USAGE_ERROR')
    expect(err.message).toBe('bad argument')
  })

  it('AuthRequiredError has exit code 2', () => {
    const err = new AuthRequiredError()
    expect(err.exitCode).toBe(ExitCode.AUTH_REQUIRED)
    expect(err.code).toBe('AUTH_REQUIRED')
    expect(err.hint).toBe('Run: vasig auth')
  })

  it('NetworkError has exit code 3 and is retryable', () => {
    const err = new NetworkError('timeout')
    expect(err.exitCode).toBe(ExitCode.NETWORK)
    expect(err.code).toBe('NETWORK_ERROR')
    expect(err.retryable).toBe(true)
  })

  it('UsageError is not retryable', () => {
    const err = new UsageError('bad input')
    expect(err.retryable).toBe(false)
  })

  it('toErrorJson returns structured JSON with retryable', () => {
    const err = new AuthRequiredError()
    const json = toErrorJson(err)
    expect(json).toEqual({
      ok: false,
      v: 1,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required. Run vasig auth to set up credentials.',
        hint: 'Run: vasig auth',
        suggestions: ['vasig auth setup'],
        retryable: false,
      },
    })
  })

  it('toErrorJson includes retryable true for NetworkError', () => {
    const json = toErrorJson(new NetworkError('timeout'))
    expect(json.error.retryable).toBe(true)
  })

  it('toErrorJson handles plain Error with retryable false', () => {
    const json = toErrorJson(new Error('something broke'))
    expect(json.ok).toBe(false)
    expect(json.v).toBe(1)
    expect(json.error.code).toBe('UNKNOWN_ERROR')
    expect(json.error.message).toBe('something broke')
    expect(json.error.retryable).toBe(false)
  })

  it('toErrorJson includes suggestions when present', () => {
    const err = new AuthRequiredError()
    const json = toErrorJson(err)
    expect(json.error.suggestions).toEqual(['vasig auth setup'])
  })

  it('toErrorJson omits suggestions when empty', () => {
    const err = new UsageError('bad input')
    const json = toErrorJson(err)
    expect(json.error.suggestions).toBeUndefined()
  })

  it('VasigError accepts suggestions in constructor', () => {
    const err = new UsageError('bad', 'hint', ['vasig help'])
    expect(err.suggestions).toEqual(['vasig help'])
  })

  it('toErrorJson includes v: 1', () => {
    const json = toErrorJson(new UsageError('bad'))
    expect(json.v).toBe(1)
  })
})

describe('EXIT_CODE_DESCRIPTIONS', () => {
  it('covers all ExitCode enum values', () => {
    const codes = Object.values(ExitCode).filter(v => typeof v === 'number') as number[]
    expect(codes).toHaveLength(7)
    for (const code of codes) {
      expect(EXIT_CODE_DESCRIPTIONS[code as ExitCode]).toBeDefined()
      expect(EXIT_CODE_DESCRIPTIONS[code as ExitCode].length).toBeGreaterThan(0)
    }
  })
})

describe('cleanSdkMessage', () => {
  it('replaces ContractFunctionExecutionError with clean message', () => {
    expect(cleanSdkMessage('ContractFunctionExecutionError: call failed')).toBe('Contract call failed')
  })

  it('replaces BigInt conversion error', () => {
    expect(cleanSdkMessage('Cannot convert abc to a BigInt')).toBe('Invalid amount')
  })

  it('replaces NaN with clean message', () => {
    expect(cleanSdkMessage('got NaN for value')).toBe('Invalid numeric value')
  })

  it('strips LI.FI SDK version tags', () => {
    expect(cleanSdkMessage('[LI.FI SDK v2.1] some error')).toBe('some error')
  })

  it('strips Details: blocks', () => {
    const input = 'Transaction failed\n\nDetails: some verbose info\nmore details'
    expect(cleanSdkMessage(input)).toBe('Transaction failed')
  })

  it('strips docs.li.fi URLs', () => {
    expect(cleanSdkMessage('Route not found. Check https://docs.li.fi/errors')).toBe('Route not found.')
  })

  it('returns original when cleaned result is empty', () => {
    const input = '[LI.FI SDK v2.1] '
    const result = cleanSdkMessage(input)
    expect(result).toBe(input)
  })

  it('returns empty string as-is', () => {
    expect(cleanSdkMessage('')).toBe('')
  })
})
