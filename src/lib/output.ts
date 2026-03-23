import { VasigError, toErrorJson } from './errors.js'

export type OutputFormat = 'json' | 'table'

let _quiet = false
export function setQuiet(q: boolean): void { _quiet = q }

let _fields: string[] | undefined
export function setFields(f: string[] | undefined): void { _fields = f }

export function filterFields(data: unknown, fields: string[]): unknown {
  if (!fields.length) return data
  if (Array.isArray(data)) return data.map(item => filterFields(item, fields))
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter(([k]) => fields.includes(k))
    )
  }
  return data
}

export function formatOutput(data: unknown, format: OutputFormat): string {
  let out = _quiet ? stripEmpty(data) : data
  if (_fields?.length) {
    warnInvalidFields(out, _fields)
    out = filterFields(out, _fields)
  }
  if (format === 'json') {
    return JSON.stringify({ ok: true, v: 1, data: out }, null, 2)
  }
  return formatTable(out)
}

function collectKeys(data: unknown): Set<string> {
  if (Array.isArray(data)) {
    const keys = new Set<string>()
    for (const item of data) {
      if (item !== null && typeof item === 'object') {
        for (const k of Object.keys(item as Record<string, unknown>)) keys.add(k)
      }
    }
    return keys
  }
  if (data !== null && typeof data === 'object') {
    return new Set(Object.keys(data as Record<string, unknown>))
  }
  return new Set()
}

function warnInvalidFields(data: unknown, fields: string[]): void {
  const available = collectKeys(data)
  if (available.size === 0) return
  const invalid = fields.filter(f => !available.has(f))
  if (invalid.length > 0) {
    process.stderr.write(`Warning: unknown field(s): ${invalid.join(', ')}. Available: ${[...available].join(', ')}\n`)
  }
}

function stripEmpty(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(stripEmpty)
  if (data !== null && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>)
        .filter(([, v]) => v != null && v !== '' && v !== 0 && v !== '0')
    )
  }
  return data
}

function formatCellValue(key: string, value: unknown): string {
  if (value == null) return ''
  if ((key === 'fiatValue' || key.endsWith('Fiat')) && typeof value === 'number') {
    return `$${value.toFixed(2)}`
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function formatTable(data: unknown): string {
  if (data === null || data === undefined) return ''
  if (Array.isArray(data)) {
    if (data.length === 0) return '(empty)'
    const keys = Object.keys(data[0])
    const cells = data.map((row) => keys.map((k) => formatCellValue(k, row[k])))
    const widths = keys.map((k, i) =>
      Math.max(k.length, ...cells.map((row) => row[i].length))
    )
    const pad = (s: string, w: number) => s + ' '.repeat(w - s.length)
    const header = keys.map((k, i) => pad(k, widths[i])).join('  ')
    const rows = cells.map((row) => row.map((c, i) => pad(c, widths[i])).join('  '))
    return [header, ...rows].join('\n')
  }
  if (typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${formatCellValue(k, v)}`)
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
    if (err instanceof VasigError && err.suggestions?.length) {
      process.stderr.write(`Suggestions:\n`)
      for (const s of err.suggestions) process.stderr.write(`  - ${s}\n`)
    }
  }
}
