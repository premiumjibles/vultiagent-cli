#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const entry = join(__dirname, '..', 'src', 'index.ts')

try {
  execFileSync('npx', ['tsx', entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: join(__dirname, '..'),
  })
} catch (err) {
  // Exit with the child's exit code, don't print a stack trace
  process.exit(err.status ?? 1)
}
