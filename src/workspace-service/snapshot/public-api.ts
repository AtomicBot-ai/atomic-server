import type { CoreLink } from '../../core-link/index.js'
import type { AtcConfig } from '../../config/index.js'
import type { ClientKeys } from '../../terminal-data/index.js'
import { AtcError } from '../../errors/index.js'
import { object } from '../validation.js'
import { publicEndpoint } from './snapshot.js'
export async function callPublic(
  link: CoreLink,
  config: AtcConfig,
  keys: ClientKeys,
  request: typeof fetch,
  path: '/models' | '/chat/completions' | '/embeddings',
  body?: Record<string, unknown>
) {
  const state = await link.server.status()
  if (!state.running) throw new AtcError('ATC_USAGE', 'Start the API first.')
  const endpoint = publicEndpoint(object(state), config).endpoint,
    key = await keys.get()
  const start = Date.now()
  const deadlineMs = body ? 600000 : 10000
  // The call's own deadline expiry arrives as a bare abort (DOMException `TimeoutError`), which has a
  // numeric `code` and no cause, so the failure boundary cannot classify it. Answer it as a refusal.
  const withinDeadline = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run()
    } catch (error) {
      const name = (error as { name?: unknown } | null)?.name
      if (name === 'AbortError' || name === 'TimeoutError')
        throw new AtcError(
          'ATC_USAGE',
          `The API did not answer within ${deadlineMs / 1000} seconds. Check the loaded model and its engine log.`
        )
      throw error
    }
  }
  const response = await withinDeadline(() =>
    request(`${endpoint}${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(deadlineMs),
    })
  )
  const text = await withinDeadline(() => response.text())
  let result: unknown
  try {
    result = JSON.parse(text)
  } catch {
    throw new AtcError('ATC_USAGE', `The API returned HTTP ${response.status} without a JSON body.`)
  }
  if (!response.ok)
    throw new AtcError(
      'ATC_USAGE',
      // OpenAI's `{error: {message}}`, or an engine's own `{object: "error", message}` (`trtllm-serve`).
      String(
        object(object(result)['error'])['message'] ??
          object(result)['message'] ??
          `API returned HTTP ${response.status}.`
      )
    )
  return { result, latency_ms: Date.now() - start }
}
