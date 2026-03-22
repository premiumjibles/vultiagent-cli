import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

const CONFIG_DIR = path.join(os.homedir(), '.vultisig')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')

export interface VaultEntry {
  id: string
  name: string
  filePath: string
  extraChains?: string[]
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
