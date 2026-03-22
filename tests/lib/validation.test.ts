import { describe, it, expect } from 'vitest'
import { resolveChain, parseAmount, isEvmChain } from '../../src/lib/validation.js'
import { InvalidChainError, UsageError } from '../../src/lib/errors.js'

describe('resolveChain', () => {
  it('returns exact match for valid chain name', () => {
    expect(resolveChain('Ethereum')).toBe('Ethereum')
  })

  it('returns case-insensitive match', () => {
    expect(resolveChain('ethereum')).toBe('Ethereum')
    expect(resolveChain('BITCOIN')).toBe('Bitcoin')
    expect(resolveChain('bsc')).toBe('BSC')
  })

  it('auto-resolves unambiguous prefix match', () => {
    expect(resolveChain('Ethe')).toBe('Ethereum')
    expect(resolveChain('Arb')).toBe('Arbitrum')
  })

  it('throws InvalidChainError with suggestions for multiple prefix matches', () => {
    expect(() => resolveChain('Bi')).toThrow(InvalidChainError)
    try {
      resolveChain('Bi')
    } catch (e) {
      expect((e as InvalidChainError).message).toContain('Did you mean')
      expect((e as InvalidChainError).message).toContain('Bitcoin')
    }
  })

  it('throws InvalidChainError for completely unknown chain', () => {
    expect(() => resolveChain('FooBarChain')).toThrow(InvalidChainError)
  })

  it('suggests close matches via Levenshtein for typos', () => {
    expect(() => resolveChain('Etherem')).toThrow(InvalidChainError)
    expect(() => resolveChain('Etherem')).toThrow(/Ethereum/)
  })
})

describe('parseAmount', () => {
  it('returns -1 for "max"', () => {
    expect(parseAmount('max')).toBe(-1)
  })

  it('parses valid positive number', () => {
    expect(parseAmount('1.5')).toBe(1.5)
    expect(parseAmount('100')).toBe(100)
  })

  it('throws UsageError for zero', () => {
    expect(() => parseAmount('0')).toThrow(UsageError)
  })

  it('throws UsageError for negative number', () => {
    expect(() => parseAmount('-5')).toThrow(UsageError)
  })

  it('throws UsageError for non-numeric string', () => {
    expect(() => parseAmount('abc')).toThrow(UsageError)
    expect(() => parseAmount('')).toThrow(UsageError)
  })
})

describe('isEvmChain', () => {
  it('returns true for EVM chains', () => {
    expect(isEvmChain('Ethereum')).toBe(true)
    expect(isEvmChain('Arbitrum')).toBe(true)
    expect(isEvmChain('BSC')).toBe(true)
    expect(isEvmChain('Polygon')).toBe(true)
  })

  it('returns false for non-EVM chains', () => {
    expect(isEvmChain('Bitcoin')).toBe(false)
    expect(isEvmChain('Solana')).toBe(false)
    expect(isEvmChain('THORChain')).toBe(false)
  })
})
