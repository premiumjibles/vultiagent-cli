import { withVault } from '../lib/sdk.js'
import { printResult } from '../lib/output.js'
import type { OutputFormat } from '../lib/output.js'
import type { AddressResult } from '../types.js'

export async function getAddresses(): Promise<AddressResult[]> {
  return withVault(async ({ vault }) => {
    const results: AddressResult[] = []
    for (const chain of vault.chains) {
      const address = await vault.address(chain)
      results.push({ chain, address })
    }
    return results
  })
}

export async function addressesCommand(format: OutputFormat): Promise<void> {
  const results = await getAddresses()
  printResult(results, format)
}
