import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OutputFormat, formatOutput, printResult, printError } from '../../src/lib/output.js'
import { AuthRequiredError, toErrorJson } from '../../src/lib/errors.js'

describe('output formatting', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  it('formatOutput json returns stringified JSON', () => {
    const data = { balance: '1.5', chain: 'ETH' }
    const result = formatOutput(data, 'json')
    expect(JSON.parse(result)).toEqual({ ok: true, data })
  })

  it('formatOutput table returns human-readable text', () => {
    const data = { balance: '1.5', chain: 'ETH' }
    const result = formatOutput(data, 'table')
    expect(result).toContain('balance')
    expect(result).toContain('1.5')
  })

  it('printResult writes to stdout with newline', () => {
    printResult({ value: 1 }, 'json')
    expect(stdoutSpy).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls[0][0] as string
    expect(JSON.parse(output)).toEqual({ ok: true, data: { value: 1 } })
  })

  it('printError writes JSON error to stderr', () => {
    const err = new AuthRequiredError()
    printError(err, 'json')
    expect(stderrSpy).toHaveBeenCalled()
    const output = stderrSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)
    expect(parsed.ok).toBe(false)
    expect(parsed.error.code).toBe('AUTH_REQUIRED')
  })
})
