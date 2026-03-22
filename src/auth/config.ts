import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

const CONFIG_DIR = path.join(os.homedir(), '.vultisig')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

export interface PersistedToken {
  id: string
  symbol: string
  decimals: number
  contractAddress: string
}

export interface VaultEntry {
  id: string
  name: string
  filePath: string
  extraChains?: string[]
  tokens?: Record<string, PersistedToken[]>
}

export interface VasigConfig {
  vaults: VaultEntry[]
}

export async function loadConfig(): Promise<VasigConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    return JSON.parse(raw) as VasigConfig
  } catch {
    return { vaults: [] }
  }
}

export async function saveConfig(config: VasigConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

export function getConfigPath(): string {
  return CONFIG_PATH
}

export async function persistTokens(vaultId: string, chain: string, tokens: PersistedToken[]): Promise<void> {
  const config = await loadConfig()
  const entry = config.vaults.find((v) => v.id === vaultId)
  if (!entry) return
  if (!entry.tokens) entry.tokens = {}
  entry.tokens[chain] = tokens
  await saveConfig(config)
}

export async function removePersistedToken(vaultId: string, chain: string, contractAddress: string): Promise<void> {
  const config = await loadConfig()
  const entry = config.vaults.find((v) => v.id === vaultId)
  if (!entry?.tokens?.[chain]) return
  entry.tokens[chain] = entry.tokens[chain].filter((t) => t.contractAddress !== contractAddress)
  if (entry.tokens[chain].length === 0) delete entry.tokens[chain]
  await saveConfig(config)
}

export async function clearPersistedTokens(vaultId: string, chain?: string): Promise<void> {
  const config = await loadConfig()
  const entry = config.vaults.find((v) => v.id === vaultId)
  if (!entry?.tokens) return
  if (chain) {
    delete entry.tokens[chain]
  } else {
    entry.tokens = {}
  }
  await saveConfig(config)
}
