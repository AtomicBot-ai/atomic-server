import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { CoreLink } from '../core-link/index.js'
import type { AtcPaths } from '../config/index.js'
import type { WorkspaceInput } from '../contract/index.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { AtcError } from '../errors/index.js'
import { object, segment } from './validation.js'
import { NOT_CORE } from './not-core.js'

type Provider = { provider: string; base_url?: string; models?: string[]; has_api_key?: boolean }
type Receipt = { fingerprint: string; checked_at: number }
function fingerprint(provider: Provider) {
  return JSON.stringify([provider.base_url, provider.models, provider.has_api_key])
}
/** Connection checks belong to the workspace; credentials remain in the core's store. */
export async function cloudOperation(
  link: CoreLink,
  paths: AtcPaths,
  request: typeof fetch,
  name: string,
  input: WorkspaceInput
): Promise<unknown> {
  if (!name.startsWith('cloud.')) return NOT_CORE
  const provider = String(input['provider'] ?? '').trim()
  const receiptPath = (id: string) =>
    join(paths.atcDir, 'cloud-checks', `${createHash('sha256').update(id).digest('hex')}.json`)
  if (name === 'cloud.list') {
    const result = await link.request<{ providers?: Provider[] }>('GET', '/cloud/providers')
    return {
      providers: await Promise.all(
        (result.providers ?? []).map(async (p) => {
          const receipt = await readDocument<Receipt | null>(receiptPath(p.provider), null)
          return {
            ...p,
            connected: receipt?.fingerprint === fingerprint(p),
            ...(receipt?.fingerprint === fingerprint(p) ? { checked_at: receipt.checked_at } : {}),
          }
        })
      ),
    }
  }
  if (name === 'cloud.remove' || name === 'cloud.save') {
    await writeDocument(receiptPath(provider), null)
    return NOT_CORE
  }
  if (name !== 'cloud.connect') return NOT_CORE
  const url = connectionUrl(String(input['base_url'] ?? ''))
  const requested = (input['models'] as string[]).map((m) => m.trim()).filter(Boolean)
  if (!provider) throw new AtcError('ATC_USAGE', 'Enter a provider.')
  const key = String(input['api_key'] ?? '').trim()
  const existing = await link.request<{ providers?: Provider[] }>('GET', '/cloud/providers')
  if (!key && existing.providers?.some((p) => p.provider === provider && p.has_api_key))
    throw new AtcError('ATC_USAGE', 'Enter the API key again to check this connection.')
  const models = await checkConnection(request, url, key, requested)
  const saved = await link.request<Provider>('PUT', `/cloud/providers/${segment(provider)}`, {
    base_url: url,
    models,
    ...(key ? { api_key: key } : {}),
  })
  const checked_at = Date.now()
  await writeDocument(receiptPath(provider), { fingerprint: fingerprint(saved), checked_at })
  return { ...saved, connected: true, checked_at }
}

function connectionUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error()
    return url.href.replace(/\/+$/, '')
  } catch {
    throw new AtcError('ATC_USAGE', 'Enter a valid HTTP or HTTPS base URL without credentials or a query.')
  }
}

async function checkConnection(request: typeof fetch, url: string, key: string, models: string[]) {
  let response: Response
  try {
    response = await request(`${url}/models`, {
      method: 'GET',
      redirect: 'error',
      headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    throw new AtcError('ATC_USAGE', 'Could not reach the provider. Check its base URL and try again.')
  }
  if (!response.ok)
    throw new AtcError(
      'ATC_USAGE',
      response.status === 401 || response.status === 403
        ? 'The provider rejected this API key. Check the key and try again.'
        : `The provider returned HTTP ${response.status}. Check its base URL and try again.`
    )
  const body = object(await response.json().catch(() => null))
  if (!Array.isArray(body['data']))
    throw new AtcError('ATC_USAGE', 'This endpoint did not return an OpenAI-compatible model list.')
  const available = new Set(
    body['data'].flatMap((m: unknown) => {
      const id = object(m)['id']
      return typeof id === 'string' && id.trim() ? [id] : []
    })
  )
  if (!available.size) throw new AtcError('ATC_USAGE', 'This provider has no available models.')
  const missing = models.filter((model) => !available.has(model))
  if (missing.length)
    throw new AtcError('ATC_USAGE', `Model not available from this provider: ${missing.join(', ')}.`)
  return models.length ? models : [...available]
}
