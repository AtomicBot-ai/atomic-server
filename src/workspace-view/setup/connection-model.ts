import { downloadRows } from '../downloads/downloads.js'
import { downloadHeld } from '../downloads/download-controls.js'

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

/** Variant jobs load as their variant, on their own engine. */
const VARIANT_JOBS: Record<string, string> = {
  'foundry-model': 'foundry-local',
  'litert-model': 'litert-lm',
  'geniex-model': 'geniex',
  'fastflowlm-model': 'fastflowlm',
}

export function connectionDownloadTarget(job: unknown) {
  const row = record(job),
    plan = record(row['plan']),
    variantEngine = VARIANT_JOBS[String(row['kind'])]
  return {
    model: String(
      variantEngine
        ? (plan['variant_id'] ?? '')
        : row['kind'] === 'managed-model'
          ? (plan['repository'] ?? '')
          : (row['model_id'] ?? plan['model_id'] ?? plan['repository'] ?? plan['variant_id'] ?? '')
    ),
    provider: String(
      row['provider'] ??
        plan['provider'] ??
        (typeof plan['engine'] === 'string' ? plan['engine'] : undefined) ??
        variantEngine ??
        ''
    ),
  }
}

/** An explicit empty provider list is authoritative; older rows only carry a single provider. */
export function connectionModelProviders(model: unknown): string[] {
  const row = record(model)
  return [
    ...new Set(
      (Array.isArray(row['providers']) ? row['providers'] : [row['provider']]).filter(
        (provider): provider is string => typeof provider === 'string' && provider !== ''
      )
    ),
  ]
}

/** Readiness never starts a connection: the user must still choose Configure & start. */
export function connectionModelState(
  model: string,
  installed: readonly unknown[],
  setups: readonly unknown[],
  downloads: readonly unknown[],
  preferredProvider = '',
  installedProviders?: readonly string[]
) {
  const local = installed.map(record).find((row) => (row['id'] ?? row['model_id']) === model),
    job = model ? connectionDownload(setups, model) : undefined,
    target = connectionDownloadTarget(job),
    pendingProvider = target.provider || preferredProvider,
    providers = local
      ? connectionModelProviders(local).filter(
          (provider) => !installedProviders || installedProviders.includes(provider)
        )
      : [pendingProvider].filter(Boolean),
    provider = providers.includes(preferredProvider) ? preferredProvider : (providers[0] ?? ''),
    row = job
      ? downloadRows([job], downloads).find((item) => item.id === String(job['id'] ?? job['setup_id'] ?? ''))
      : undefined,
    state = row?.state ?? (job ? String(job['stage'] ?? job['state'] ?? '') : ''),
    percent = row && row.total > 0 ? Math.min(100, Math.floor((row.transferred / row.total) * 100)) : null
  const pendingEngine = downloadRows([], downloads).find(
    (item) => item['kind'] === 'engine' && item['engine'] === (provider || preferredProvider)
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
        : installedProviders
          ? 'No installed engine can run this model. Choose another engine or model.'
          : 'No compatible inference engine. Choose a different model.'
    else if (downloadHeld(state)) status = 'Download paused. Resume it to continue.'
    else if (/failed|interrupted/.test(state)) status = 'Download failed. Resume it to retry.'
    else if (/removed|deleted/.test(state) || !job)
      status = 'Model is not downloaded. Choose it again to start a download.'
    else if (/ready|complete|verifying|registering/.test(state)) status = 'Finishing model setup…'
    else status = `Waiting for the model download${percent === null ? '…' : ` · ${percent}%`}`
  }
  return {
    ready: Boolean(local && provider && !pendingEngine),
    providers,
    provider,
    status,
    percent,
    waiting: Boolean(pendingEngine || (model && job && !local && !/removed|deleted/.test(state))),
  }
}

/**
 * What the Server panel names as engine and model: the running chat service, else the preferred
 * engine (`engines.selected`, or the terminal's saved choice) and the last text download; the same rule
 * in the web admin and the terminal UI, so both show one answer for one server.
 */
export function serverPanelSelection(
  snapshot:
    | {
        services?: readonly unknown[]
        setups?: readonly unknown[]
        selection?: { engine: string; model: string }
      }
    | null
    | undefined,
  preferredEngine = ''
): { engine: string; model: string } {
  const service = (snapshot?.services ?? [])
    .map(record)
    .find((s) => s['kind'] === 'chat' && ['ready', 'loaded', 'running'].includes(String(s['state'])))
  if (service) return { engine: String(service['provider'] ?? ''), model: String(service['model'] ?? '') }
  const target = connectionDownloadTarget(connectionDownload(snapshot?.setups ?? []))
  const saved = snapshot?.selection
  return { engine: saved?.engine || preferredEngine || target.provider, model: saved?.model || target.model }
}
