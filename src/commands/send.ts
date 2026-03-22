import type { OutputFormat } from '../lib/output.js'

export async function sendCommand(_opts: { chain: string; to: string; amount: string; token?: string; memo?: string; yes?: boolean }, _format: OutputFormat): Promise<void> {
  throw new Error('Not implemented')
}
