import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

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
