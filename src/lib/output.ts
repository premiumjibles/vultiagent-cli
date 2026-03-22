import { VasigError, toErrorJson } from './errors.js'

export type OutputFormat = 'json' | 'table'

export function formatOutput(data: unknown, format: OutputFormat): string {
  if (format === 'json') {
    return JSON.stringify({ ok: true, data }, null, 2)
  }
  return formatTable(data)
}

function formatTable(data: unknown): string {
  if (data === null || data === undefined) return ''
  if (Array.isArray(data)) {
    if (data.length === 0) return '(empty)'
    const keys = Object.keys(data[0])
    const header = keys.join('\t')
    const rows = data.map((row) => keys.map((k) => String(row[k] ?? '')).join('\t'))
    return [header, ...rows].join('\n')
  }
  if (typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('\n')
  }
  return String(data)
}

export function printResult(data: unknown, format: OutputFormat): void {
  process.stdout.write(formatOutput(data, format) + '\n')
}

export function printError(err: Error, format: OutputFormat): void {
  if (format === 'json') {
    process.stderr.write(JSON.stringify(toErrorJson(err), null, 2) + '\n')
  } else {
    const prefix = err instanceof VasigError ? `Error [${err.code}]` : 'Error'
    process.stderr.write(`${prefix}: ${err.message}\n`)
    if (err instanceof VasigError && err.hint) {
      process.stderr.write(`Hint: ${err.hint}\n`)
    }
  }
}
