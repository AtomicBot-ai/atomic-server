import { downloadRows } from './downloads.js'

type Row = Record<string, unknown>
const record = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}

/** Read a connection's model and engine from the selected download, before installation finishes. */
export function connectionDownload(setups: readonly unknown[], model = '') {
  const matches = setups.map(record).filter((job) => {
    const plan = record(job['plan'])
    return (
      !['image', 'video', 'audio'].includes(String(plan['category'] ?? job['category'] ?? '')) &&
      (!model || [job['model_id'], plan['model_id'], plan['repository'], plan['variant_id']].includes(model))
    )
  })
  // Snapshots combine stores with different list orders. Prefer the most recent
  // attempt; a just-created response without timestamps is appended by the picker.
  const timestamp = (job: Row) => {
    const values = [job['updated_at'], job['created_at']].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    )
    return values.length ? Math.max(...values) : null
  }
  return matches.reduce<Row | undefined>((current, candidate) => {
    if (!current) return candidate
    const previous = timestamp(current),
      next = timestamp(candidate)
    return previous === null || next === null || next >= previous ? candidate : current
  }, undefined)
}

export function connectionDownloadTarget(job: unknown) {
  const row = record(job),
    plan = record(row['plan'])
  return {
    model: String(
      row['kind'] === 'foundry-model'
        ? (plan['variant_id'] ?? '')
        : row['kind'] === 'managed-model'
          ? (plan['repository'] ?? '')
          : (row['model_id'] ?? plan['model_id'] ?? plan['repository'] ?? plan['variant_id'] ?? '')
    ),
    provider: String(
      row['provider'] ??
        plan['provider'] ??
        (typeof plan['engine'] === 'string' ? plan['engine'] : undefined) ??
        (row['kind'] === 'foundry-model' ? 'foundry-local' : '')
    ),
  }
}

/** Readiness never starts a connection: the user must still choose Configure & start. */
export function connectionModelState(
  model: string,
  installed: readonly unknown[],
  setups: readonly unknown[],
  downloads: readonly unknown[],
  preferredProvider = ''
) {
  const local = installed.map(record).find((row) => (row['id'] ?? row['model_id']) === model),
    job = connectionDownload(setups, model),
    target = connectionDownloadTarget(job),
    pendingProvider = target.provider || preferredProvider,
    available = local
      ? Array.isArray(local['providers'])
        ? local['providers'].map(String)
        : [String(local['provider'] ?? '')]
      : [pendingProvider],
    providers = [...new Set(available.filter(Boolean))],
    provider = providers.includes(preferredProvider) ? preferredProvider : (providers[0] ?? ''),
    row = job
      ? downloadRows([job], downloads).find((item) => item.id === String(job['id'] ?? job['setup_id'] ?? ''))
      : undefined,
    state = row?.state ?? (job ? String(job['stage'] ?? job['state'] ?? '') : ''),
    percent = row && row.total > 0 ? Math.min(100, Math.floor((row.transferred / row.total) * 100)) : null
  const pendingEngine = downloadRows([], downloads).find(
    (item) => item['kind'] === 'engine' && item['engine'] === provider
  )
  let status = 'Choose a model to continue.'
  if (model) {
    if (local && pendingEngine)
      status = /failed|interrupted/.test(pendingEngine.state)
        ? 'Retry the engine download to continue.'
        : 'The engine is downloading. Wait until it is ready.'
    else if (local)
      status = providers.length
        ? 'Model ready. Configure the connection to continue.'
        : 'No compatible inference engine. Choose a different model.'
    else if (/paused|cancelled/.test(state)) status = 'Download paused. Resume it to continue.'
    else if (/failed|interrupted/.test(state)) status = 'Download failed. Resume it to retry.'
    else if (/removed|deleted/.test(state) || !job)
      status = 'Model is not downloaded. Choose it again to start a download.'
    else if (/ready|complete|verifying|registering/.test(state)) status = 'Finishing model setup…'
    else status = `Waiting for the model download${percent === null ? '…' : ` · ${percent}%`}`
  }
  return {
    ready: Boolean(local && !pendingEngine),
    providers,
    provider,
    status,
    percent,
    waiting: Boolean(pendingEngine || (model && job && !local && !/removed|deleted/.test(state))),
  }
}
