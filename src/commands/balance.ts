import type { OutputFormat } from '../lib/output.js'

export async function balanceCommand(_opts: { chain?: string; includeTokens?: boolean }, _format: OutputFormat): Promise<void> {
  throw new Error('Not implemented')
}
