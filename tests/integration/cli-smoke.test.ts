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

  it('swap --help shows required options', () => {
    const output = run('swap --help')
    expect(output).toContain('--from')
    expect(output).toContain('--to')
    expect(output).toContain('--amount')
    expect(output).toContain('--yes')
  })
})
