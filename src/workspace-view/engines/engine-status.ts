import type { WorkspaceSnapshot } from '../../contract/index.js'
import { phaseText } from './engines.js'

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const SETTLED_PHASES = ['ready', 'removed', 'cancelled', 'failed']

/**
 * One line for an engine in a list (the Web's Engines tab, the terminal's Inference engines), from its
 * `engines.list` row and the snapshot: an install in progress or failed, the active build and an update
 * the core offers, or that nothing is installed.
 */
export function engineStatus(
  row: Record<string, unknown>,
  snapshot?: Pick<WorkspaceSnapshot, 'downloads' | 'engines'> | null
): string {
  const id = String(row['engine'] ?? row['id'] ?? '')
  const jobs = (snapshot?.downloads ?? [])
    .map(record)
    .filter((d) => d['kind'] === 'engine' && d['engine'] === id)
    .sort((a, b) => (Number(b['updated_at']) || 0) - (Number(a['updated_at']) || 0))
  const job = jobs.find((d) => !['ready', 'failed', 'interrupted'].includes(String(d['stage'])))
  if (job) {
    const total = Number(job['total']) || 0
    return total > 0
      ? `Installing · ${Math.floor((Number(job['transferred']) / total) * 100)}%`
      : 'Installing'
  }
  const managed = snapshot?.engines?.find((e) => e.engine === id)
  const operation = managed?.operation
  if (operation && !SETTLED_PHASES.includes(operation.phase)) return phaseText(operation)
  const installFailed = jobs[0]?.['stage'] === 'failed'
  const failure = row['source_error'] || record(row['error'])['message']
  const active = record(row['active'])
  if (active['version']) {
    const build = `Installed · ${String(active['version'])}${active['variant'] ? ` · ${String(active['variant'])}` : ''}`
    if (installFailed) return `${build} · install failed`
    const update = record(row['update']),
      target = record(update['target'])
    return update['needed'] === true && target['version']
      ? `${build} · update ${String(target['version'])}`
      : build
  }
  const installation = managed?.installation
  if (installation?.status === 'ready')
    return `Installed${installation.active_descriptor_id ? ` · ${installation.active_descriptor_id}` : ''}`
  if (installFailed) return 'Install failed'
  if (Array.isArray(row['builds']) && row['builds'].length) return 'Installed'
  if (failure) return `Unavailable: ${String(failure)}`
  return 'Not installed'
}
