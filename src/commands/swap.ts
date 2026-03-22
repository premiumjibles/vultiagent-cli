import type { OutputFormat } from '../lib/output.js'

export async function swapCommand(_opts: { from: string; to: string; amount: string; yes?: boolean }, _format: OutputFormat): Promise<void> {
  throw new Error('Not implemented')
}

export async function swapQuoteCommand(_opts: { from: string; to: string; amount: string }, _format: OutputFormat): Promise<void> {
  throw new Error('Not implemented')
}

export async function swapChainsCommand(_format: OutputFormat): Promise<void> {
  throw new Error('Not implemented')
}
