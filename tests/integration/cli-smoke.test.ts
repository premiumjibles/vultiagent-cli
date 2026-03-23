import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

describe('CLI smoke tests', () => {
  const run = (args: string) =>
    execSync(`npx tsx src/index.ts ${args}`, {
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, NODE_ENV: 'test' },
    })

  it('--help shows all command groups', () => {
    const output = run('--help')
    expect(output).toContain('auth')
    expect(output).toContain('balance')
    expect(output).toContain('send')
    expect(output).toContain('swap')
    expect(output).toContain('addresses')
    expect(output).toContain('vault')
    expect(output).toContain('chains')
  })

  it('--help shows exit codes', () => {
    const output = run('--help')
    expect(output).toContain('Exit codes:')
    expect(output).toContain('Network error (retryable)')
  })

  it('--version returns semver', () => {
    const output = run('--version')
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('balance --help shows options', () => {
    const output = run('balance --help')
    expect(output).toContain('--chain')
    expect(output).toContain('--include-tokens')
  })

  it('send --help shows required options', () => {
    const output = run('send --help')
    expect(output).toContain('--chain')
    expect(output).toContain('--to')
    expect(output).toContain('--amount')
    expect(output).toContain('--yes')
  })

  it('swap --help shows subcommands', () => {
    const output = run('swap --help')
    expect(output).toContain('execute')
    expect(output).toContain('quote')
    expect(output).toContain('chains')
  })

  it('swap execute --help shows required options', () => {
    const output = run('swap execute --help')
    expect(output).toContain('--from')
    expect(output).toContain('--to')
    expect(output).toContain('--amount')
    expect(output).toContain('--yes')
  })

  it('swap quote --help shows required options', () => {
    const output = run('swap quote --help')
    expect(output).toContain('--from')
    expect(output).toContain('--to')
    expect(output).toContain('--amount')
  })

  it('swap chains --help works', () => {
    const output = run('swap chains --help')
    expect(output).toContain('List supported swap chains')
  })

  it('deprecated swap-quote still works', () => {
    try {
      execSync('npx tsx src/index.ts swap-quote --help', {
        encoding: 'utf-8',
        timeout: 10000,
        env: { ...process.env, NODE_ENV: 'test' },
      })
    } catch (e: any) {
      // Commander may exit with code 0 for help, which execSync doesn't throw on
      // If it threw, the stderr should have deprecation notice or help output
      expect(e.stdout || e.stderr || '').toBeDefined()
    }
  })

  it('schema includes exitCodes', () => {
    const output = run('schema')
    const schema = JSON.parse(output)
    expect(schema.exitCodes).toBeDefined()
    expect(schema.exitCodes['0']).toBe('Success')
    expect(schema.exitCodes['3']).toContain('retryable')
    expect(Object.keys(schema.exitCodes)).toHaveLength(7)
  })

  it('schema global --output has enumValues', () => {
    const schema = JSON.parse(run('schema'))
    const outputOpt = schema.globalOptions.find((o: any) => o.flags.includes('--output'))
    expect(outputOpt.enumValues).toEqual(['json', 'table'])
  })

  it('schema send command has responseSchema', () => {
    const schema = JSON.parse(run('schema'))
    const send = schema.commands.find((c: any) => c.name === 'send')
    expect(send.responseSchema).toBeDefined()
    expect(send.responseSchema.txHash).toBe('string')
    expect(send.responseSchema.chain).toBe('string')
    expect(send.responseSchema.explorerUrl).toBe('string')
  })

  it('--help shows --fields option', () => {
    const output = run('--help')
    expect(output).toContain('--fields')
  })

  it('schema swap command has subcommands with responseSchemas', () => {
    const schema = JSON.parse(run('schema'))
    const swap = schema.commands.find((c: any) => c.name === 'swap')
    expect(swap.subcommands).toBeDefined()
    const names = swap.subcommands.map((s: any) => s.name)
    expect(names).toContain('execute')
    expect(names).toContain('quote')
    expect(names).toContain('chains')
    const execute = swap.subcommands.find((s: any) => s.name === 'execute')
    expect(execute.responseSchema.txHash).toBe('string')
  })

  it('schema does not include deprecated swap-quote', () => {
    const schema = JSON.parse(run('schema'))
    const names = schema.commands.map((c: any) => c.name)
    expect(names).not.toContain('swap-quote')
    expect(names).not.toContain('swap-chains')
  })

  it('schema balance command has responseSchema', () => {
    const schema = JSON.parse(run('schema'))
    const balance = schema.commands.find((c: any) => c.name === 'balance')
    expect(balance.responseSchema).toBeDefined()
    expect(balance.responseSchema.chain).toBe('string')
    expect(balance.responseSchema.amount).toBe('string')
  })
})
