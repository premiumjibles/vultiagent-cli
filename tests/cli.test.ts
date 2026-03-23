import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { getCommandFromArgv, getFormatFromArgv } from '../src/index.js'

describe('getCommandFromArgv', () => {
  it('returns command name from simple args', () => {
    expect(getCommandFromArgv(['balance'])).toBe('balance')
  })

  it('skips --output value to find command', () => {
    expect(getCommandFromArgv(['--output', 'json', 'send', '--badopt'])).toBe('send')
  })

  it('skips -o value to find command', () => {
    expect(getCommandFromArgv(['-o', 'json', 'balance'])).toBe('balance')
  })

  it('skips --vault-id value to find command', () => {
    expect(getCommandFromArgv(['--vault-id', 'abc123', 'send'])).toBe('send')
  })

  it('skips multiple options with values', () => {
    expect(getCommandFromArgv(['--output', 'json', '--vault-id', 'v1', 'chains'])).toBe('chains')
  })

  it('returns --help when no command found', () => {
    expect(getCommandFromArgv(['--output', 'json'])).toBe('--help')
  })

  it('handles flags without values before command', () => {
    expect(getCommandFromArgv(['--quiet', 'balance'])).toBe('balance')
  })
})

describe('getFormatFromArgv', () => {
  it('detects --output json', () => {
    expect(getFormatFromArgv(['node', 'vasig', '--output', 'json', 'balance'])).toBe('json')
  })

  it('detects -o json', () => {
    expect(getFormatFromArgv(['node', 'vasig', '-o', 'json', 'balance'])).toBe('json')
  })

  it('defaults to table when no format flag', () => {
    expect(getFormatFromArgv(['node', 'vasig', 'balance'])).toBe('table')
  })

  it('defaults to table for non-json format', () => {
    expect(getFormatFromArgv(['node', 'vasig', '--output', 'table'])).toBe('table')
  })
})

describe('CLI entry point', () => {
  it('shows help with --help flag', () => {
    const output = execSync('npx tsx src/index.ts --help', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    expect(output).toContain('vasig')
    expect(output).toContain('Authentication')
  })

  it('shows version with --version flag', () => {
    const output = execSync('npx tsx src/index.ts --version', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    })
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
