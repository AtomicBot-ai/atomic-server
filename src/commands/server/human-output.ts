/**
 * What an operation's answer looks like on a terminal without `--json`: a table for a catalog, a
 * search, a repository's files or any list of flat records; key/value lines for a plan, the hardware
 * facts or any flat object. Anything deeper stays JSON, which `printOperation` prints as before.
 */

import { renderTable } from '../../output/index.js'
import { appleSiliconGpu, formatSize } from '../../workspace-view/index.js'

type Row = Record<string, unknown>
const record = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {})
const scalar = (v: unknown): v is string | number | boolean | null =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v)
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const kv = (pairs: Array<[string, string]>): string[] => {
  const width = Math.max(0, ...pairs.map(([k]) => k.length))
  return pairs.map(([k, v]) => `${k.padEnd(width)}  ${v}`)
}
const table = (headers: string[], rows: string[][], width: number): string[] =>
  renderTable(
    headers.map((header) => ({ header })),
    rows,
    { width }
  )
    .trimEnd()
    .split('\n')

function catalog(result: unknown, width: number): string[] | undefined {
  const rows = Array.isArray(result) ? result : record(result)['rows']
  if (!Array.isArray(rows)) return undefined
  const lines = table(
    ['MODEL', 'NAME', 'FORMAT'],
    rows
      .map(record)
      .map((r) => [
        text(r['id']),
        text(r['name']),
        text(record(r['source'])['format'] ?? 'gguf').toUpperCase(),
      ]),
    width
  )
  return [...lines, `${rows.length} ${rows.length === 1 ? 'model' : 'models'}`]
}

function files(result: unknown, width: number): string[] | undefined {
  const rows = Array.isArray(result) ? result : record(result)['files']
  if (!Array.isArray(rows)) return undefined
  return table(
    ['FILE', 'SIZE'],
    rows
      .map(record)
      .map((r) => [text(r['filename']), typeof r['size'] === 'number' ? formatSize(r['size']) : '']),
    width
  )
}

function plan(result: unknown): string[] | undefined {
  const r = record(result),
    model = record(r['model']),
    projector = record(r['projector']),
    engine = record(r['engine']),
    verdict = record(r['verdict'])
  if (!r['model_id'] || !model['file']) return undefined
  const sized = (artifact: Row) =>
    `${artifact['repo']}/${artifact['file']}${typeof artifact['size'] === 'number' ? ` (${formatSize(artifact['size'])})` : ''}`
  const pairs: Array<[string, string]> = [
    ['model', text(r['model_id'])],
    ['engine', text(r['provider'])],
    ['file', sized(model)],
  ]
  if (projector['file']) pairs.push(['projector', sized(projector)])
  if (engine['version'])
    pairs.push([
      'build',
      `${engine['version']}/${engine['backend']}${engine['installed'] ? ' (installed)' : ''}`,
    ])
  const free = typeof r['free_bytes'] === 'number' ? ` (${formatSize(r['free_bytes'])} free)` : ''
  if (typeof r['total_download_bytes'] === 'number')
    pairs.push(['download', `${formatSize(r['total_download_bytes'])}${free}`])
  if (verdict['outcome'])
    pairs.push(['verdict', `${verdict['outcome']}${verdict['reason'] ? `: ${verdict['reason']}` : ''}`])
  for (const blocker of Array.isArray(r['blockers']) ? r['blockers'] : [])
    pairs.push(['blocked', text(record(blocker)['message'] ?? blocker)])
  return kv(pairs)
}

function hardware(result: unknown): string[] | undefined {
  const r = record(result),
    info = record(r['info']),
    cpu = record(info['cpu'])
  if (!cpu['name'] && !Array.isArray(info['gpus'])) return undefined
  const pairs: Array<[string, string]> = []
  if (cpu['name']) pairs.push(['CPU', `${cpu['name']} (${cpu['core_count']} cores, ${cpu['arch']})`])
  if (typeof info['total_memory'] === 'number')
    pairs.push(['memory', `${Math.round(info['total_memory'] / 1024)} GB`])
  if (info['os_name']) pairs.push(['OS', text(info['os_name'])])
  const gpus = (Array.isArray(info['gpus']) ? info['gpus'] : []).map(record)
  if (!gpus.length) pairs.push(['GPU', appleSiliconGpu(info) ?? 'none listed'])
  for (const g of gpus)
    pairs.push([
      'GPU',
      `${g['name']} (${g['vendor']}${g['driver_version'] ? `, driver ${g['driver_version']}` : ''})`,
    ])
  if (r['source']) pairs.push(['source', text(r['source'])])
  for (const w of Array.isArray(r['warnings']) ? r['warnings'] : []) pairs.push(['warning', text(w)])
  return kv(pairs)
}

/** A flat object as key/value lines; a list of flat records as a table; else nothing. */
function generic(result: unknown, width: number): string[] | undefined {
  const flat = (v: unknown) => scalar(v) || (Array.isArray(v) && v.every(scalar))
  const show = (v: unknown) => (Array.isArray(v) ? (v.length ? v.map(text).join(', ') : '(none)') : text(v))
  if (Array.isArray(result)) {
    const rows = result.map(record)
    if (!rows.length || !rows.every((r) => Object.values(r).every(flat))) return undefined
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))].slice(0, 6)
    return table(
      keys,
      rows.map((r) => keys.map((k) => show(r[k]))),
      width
    )
  }
  if (!result || typeof result !== 'object') return undefined
  const entries = Object.entries(result as Row)
  if (!entries.length || !entries.every(([, v]) => flat(v))) return undefined
  return kv(entries.map(([k, v]) => [k, show(v)]))
}

const SPECIFIC: Record<string, (result: unknown, width: number) => string[] | undefined> = {
  'models.catalog': catalog,
  'models.search': catalog,
  'models.files': files,
  'models.plan': plan,
  'hardware.info': hardware,
  'hardware.refresh': hardware,
}

export function humanLines(name: string, result: unknown, width = 80): string[] | undefined {
  return SPECIFIC[name]?.(result, width) ?? generic(result, width)
}
