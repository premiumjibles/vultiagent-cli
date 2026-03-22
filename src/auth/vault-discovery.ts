import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

const SEARCH_DIRS = [
  path.join(os.homedir(), '.vultisig'),
  path.join(os.homedir(), 'Documents', 'Vultisig'),
  path.join(os.homedir(), 'Downloads'),
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Documents'),
]

export { SEARCH_DIRS }

export async function discoverVaultFiles(extraDirs: string[] = []): Promise<string[]> {
  const dirs = [...SEARCH_DIRS, process.cwd(), ...extraDirs]
  const found: string[] = []

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir)
      for (const entry of entries) {
        if (typeof entry === 'string' && entry.endsWith('.vult')) {
          const fullPath = path.join(dir, entry)
          try {
            const stat = await fs.stat(fullPath)
            if (stat.isFile()) found.push(fullPath)
          } catch {
            // skip inaccessible files
          }
        }
      }
    } catch {
      // directory doesn't exist or not accessible
    }
  }

  return [...new Set(found)]
}
