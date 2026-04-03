import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatOutput, printResult, printError, filterFields, setFields } from '../../src/lib/output.js'
import { AuthRequiredError, } from '../../src/lib/errors.js'

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
    expect(JSON.parse(result)).toEqual({ ok: true, v: 1, data })
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
    expect(JSON.parse(output)).toEqual({ ok: true, v: 1, data: { value: 1 } })
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

describe('filterFields', () => {
  it('filters object to specified fields', () => {
    const data = { chain: 'Ethereum', symbol: 'ETH', amount: '1.5', decimals: 18 }
    expect(filterFields(data, ['chain', 'amount'])).toEqual({ chain: 'Ethereum', amount: '1.5' })
  })

  it('filters array of objects', () => {
    const data = [
      { chain: 'Ethereum', symbol: 'ETH', amount: '1.5' },
      { chain: 'Bitcoin', symbol: 'BTC', amount: '0.1' },
    ]
    expect(filterFields(data, ['chain', 'amount'])).toEqual([
      { chain: 'Ethereum', amount: '1.5' },
      { chain: 'Bitcoin', amount: '0.1' },
    ])
  })

  it('returns data unchanged with empty fields array', () => {
    const data = { chain: 'Ethereum', symbol: 'ETH' }
    expect(filterFields(data, [])).toEqual(data)
  })

  it('returns empty objects for unknown field names', () => {
    const data = { chain: 'Ethereum', symbol: 'ETH' }
    expect(filterFields(data, ['nonexistent'])).toEqual({})
  })

  it('passes through non-object values', () => {
    expect(filterFields('hello', ['chain'])).toBe('hello')
    expect(filterFields(42, ['chain'])).toBe(42)
    expect(filterFields(null, ['chain'])).toBe(null)
  })
})

describe('formatOutput with fields', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    setFields(undefined)
    stderrSpy.mockRestore()
  })

  it('applies field filtering when fields are set', () => {
    setFields(['chain', 'amount'])
    const data = [{ chain: 'Ethereum', symbol: 'ETH', amount: '1.5' }]
    const result = JSON.parse(formatOutput(data, 'json'))
    expect(result.data).toEqual([{ chain: 'Ethereum', amount: '1.5' }])
  })

  it('does not filter when fields are undefined', () => {
    setFields(undefined)
    const data = { chain: 'Ethereum', symbol: 'ETH' }
    const result = JSON.parse(formatOutput(data, 'json'))
    expect(result.data).toEqual(data)
  })

  it('warns on stderr about invalid field names', () => {
    setFields(['chain', 'bogus'])
    const data = [{ chain: 'Ethereum', symbol: 'ETH', amount: '1.5' }]
    formatOutput(data, 'json')
    const warning = stderrSpy.mock.calls.map(c => c[0]).join('')
    expect(warning).toContain('bogus')
    expect(warning).toContain('unknown field')
  })

  it('does not warn when all fields are valid', () => {
    setFields(['chain', 'symbol'])
    const data = { chain: 'Ethereum', symbol: 'ETH' }
    formatOutput(data, 'json')
    expect(stderrSpy).not.toHaveBeenCalled()
  })
})

describe('schema version', () => {
  it('includes v: 1 in JSON success output', () => {
    const result = JSON.parse(formatOutput({ foo: 'bar' }, 'json'))
    expect(result.v).toBe(1)
  })
})
