import type { AtcConfig } from '../config/index.js'
import type { CoreLink } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'

export interface StartApiOptions {
  /** Listener fields a caller overrides for this start (`host`, `port`, …). */
  request?: Record<string, unknown>
  /** Is a port free on every address that can shadow it? Without it the core alone decides. */
  probePort?: (host: string, port: number) => Promise<'free' | 'busy'>
  /** The API as it is now: a start on the listener it already holds is not a conflict. */
  status?: { running: boolean; host: string; port: number }
}

/**
 * Explicitly starts inference; attaching or opening the console does not expose a listener. Clients
 * always need a key: the server checks the keyring (`client-keys.json`, created when it starts) on
 * every request, on any address. `apiKey` is one of those keys, so the core reports the API as keyed.
 *
 * Before the core binds, the port is probed: on macOS a loopback bind succeeds beside a foreign
 * wildcard listener (the Atomic Chat desktop app's `0.0.0.0:1337`), and the API would then take that
 * program's loopback traffic. The core alone cannot tell; its bind just works.
 */
export async function startApi(
  link: CoreLink,
  config: AtcConfig,
  apiKey: string,
  options: StartApiOptions = {}
) {
  if (!apiKey) throw new Error('No API key: the keyring is empty.')
  const body = {
    host: config.api.host,
    port: config.api.port,
    prefix: config.api.prefix,
    trusted_hosts: config.api.trustedHosts,
    ...options.request,
    api_key: apiKey,
    fallback_port: false,
  }
  await assertPortFree(options, String(body.host), Number(body.port))
  return link.server.start(body)
}

async function assertPortFree({ probePort, status }: StartApiOptions, host: string, port: number) {
  if (!probePort || port === 0) return
  if (status?.running && status.host === host && status.port === port) return
  if ((await probePort(host, port)) === 'free') return
  throw new AtcError('ATC_PORT_BUSY', `Port ${port} on ${host} is in use by another program.`, {
    details: 'The Atomic Chat desktop app serves its API on 0.0.0.0:1337 by default.',
    hint: 'stop that program, or `atc config set api.port <port>`',
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
