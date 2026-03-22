import type { OutputFormat } from '../lib/output.js'

export async function authSetup(_opts: { vaultFile?: string }): Promise<Record<string, unknown>> {
  throw new Error('Not implemented')
}

export async function authStatus(): Promise<Record<string, unknown>> {
  throw new Error('Not implemented')
}

export async function authLogout(_opts: { vaultId?: string; all?: boolean }): Promise<void> {
  throw new Error('Not implemented')
}
