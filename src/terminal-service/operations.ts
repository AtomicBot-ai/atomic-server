import type { AtcConfig } from '../config/index.js'
import type { CoreLink } from '../core-link/index.js'
/** Explicitly starts inference; attaching or opening the console does not expose a listener. */
export async function startApi(link: CoreLink, config: AtcConfig, apiKey = ''): Promise<void> {
  if (config.api.requireKey && !apiKey)
    throw new Error('Set ATC_API_KEY before starting an API that requires a key.')
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.api.host) && !apiKey)
    throw new Error('Set ATC_API_KEY before exposing the API beyond this machine.')
  await link.server.start({
    host: config.api.host,
    port: config.api.port,
    prefix: config.api.prefix,
    api_key: apiKey,
    trusted_hosts: config.api.trustedHosts,
    fallback_port: false,
  })
}
export interface RequestRow {
  id: string
  model: string
  endpoint: string
  status: string
  duration: number | null
  firstToken: number | null
  tokens: number | null
  time: number
}
/** Keep metadata only. Prompt text, replies and credentials never enter this view. */
export function requestRow(value: unknown): RequestRow | undefined {
  if (!value || typeof value !== 'object') return undefined
  const p = value as Record<string, unknown>
  if (p['phase'] !== 'finished' || typeof p['id'] !== 'string') return undefined
  const o = p['observation'] as Record<string, unknown> | null
  const f = p['finish'] as Record<string, unknown> | null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return {
    id: p['id'],
    model: String(o?.['model_id'] ?? 'Unknown model'),
    endpoint: String(o?.['endpoint'] ?? '/v1'),
    status: String(o?.['status'] ?? f?.['status'] ?? 'Unknown'),
    duration: num(f?.['duration_ms']),
    firstToken: num(f?.['ttft_ms']),
    tokens: num(f?.['total_tokens']),
    time: num(p['finished_at_ms']) ?? 0,
  }
}
