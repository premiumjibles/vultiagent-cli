import { describe, it, expect } from 'vitest'
import {
  VasigError,
  UsageError,
  AuthRequiredError,
  NetworkError,
  ExitCode,
  toErrorJson,
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

  it('NetworkError has exit code 3', () => {
    const err = new NetworkError('timeout')
    expect(err.exitCode).toBe(ExitCode.NETWORK)
    expect(err.code).toBe('NETWORK_ERROR')
  })

  it('toErrorJson returns structured JSON', () => {
    const err = new AuthRequiredError()
    const json = toErrorJson(err)
    expect(json).toEqual({
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication required. Run vasig auth to set up credentials.',
        hint: 'Run: vasig auth',
      },
    })
  })

  it('toErrorJson handles plain Error', () => {
    const json = toErrorJson(new Error('something broke'))
    expect(json.ok).toBe(false)
    expect(json.error.code).toBe('UNKNOWN_ERROR')
    expect(json.error.message).toBe('something broke')
  })
})
