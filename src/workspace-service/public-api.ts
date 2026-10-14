import type { CoreLink } from '../core-link/index.js'
import type { AtcConfig } from '../config/index.js'
import type { ClientKeys } from '../terminal-data/index.js'
import { AtcError } from '../errors/index.js'
import { object } from './validation.js'
import { publicEndpoint } from './snapshot.js'
export async function callPublic(
  link: CoreLink,
  config: AtcConfig,
  keys: ClientKeys,
  request: typeof fetch,
  path: '/models' | '/chat/completions',
  body?: Record<string, unknown>
) {
  const state = await link.server.status()
  if (!state.running) throw new AtcError('ATC_USAGE', 'Start the API first.')
  const endpoint = publicEndpoint(object(state), config).endpoint,
    key = await keys.get()
  const start = Date.now()
  const response = await request(`${endpoint}${path}`, {
    method: body ? 'POST' : 'GET',
    redirect: 'error',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(body ? 600000 : 10000),
  })
  const text = await response.text()
  let result: unknown
  try {
    result = JSON.parse(text)
  } catch {
    throw new AtcError('ATC_USAGE', `The API returned HTTP ${response.status} without a JSON body.`)
  }
  if (!response.ok)
    throw new AtcError(
      'ATC_USAGE',
      String(object(object(result)['error'])['message'] ?? `API returned HTTP ${response.status}.`)
    )
  return { result, latency_ms: Date.now() - start }
}
