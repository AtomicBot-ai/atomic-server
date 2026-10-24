import type { CoreLink } from '../core-link/index.js'
import type { WorkspaceServiceRow } from '../contract/index.js'
import { AtcError } from '../errors/index.js'
import { object } from './validation.js'

/** Expose only model routing metadata; provider headers and credentials never enter a snapshot. */
export async function cloudChatServices(link: CoreLink): Promise<WorkspaceServiceRow[]> {
  const data = object(await link.request('GET', '/cloud/providers'))
  const providers = Array.isArray(data['providers']) ? data['providers'].map(object) : []
  return providers.flatMap((p) => {
    const provider = typeof p['provider'] === 'string' ? p['provider'] : ''
    const models = Array.isArray(p['models'])
      ? p['models'].filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
      : []
    return provider
      ? [...new Set(models)].map((model) => ({
          id: `cloud:${provider}:${model}`,
          provider,
          model,
          kind: 'chat' as const,
          state: 'ready',
          details: { cloud: true },
        }))
      : []
  })
}

/** Public API routing is model based: reject an explicit provider that would route somewhere else. */
export async function chatProvider(link: CoreLink, model: string, requested = '') {
  const [sessions, cloud, selection] = await Promise.all([
    link.models.sessions(),
    cloudChatServices(link),
    link.request('GET', '/server/selection').then(object),
  ])
  const same = (a: string, b: string) => a.replaceAll('_', '.') === b.replaceAll('_', '.')
  const selected = Array.isArray(selection['models'])
    ? selection['models'].map(object).find((row) => same(String(row['model']), model))?.['provider']
    : undefined
  const candidates = sessions.filter((s) => !s.is_embedding && same(s.model_id, model))
  const localProviders = [
    'llamacpp',
    'llamacpp-upstream',
    'mlx',
    'tensorrt-llm',
    'atomic-prism',
    'vllm',
    'sglang',
    'foundry-local',
    'litert-lm',
  ]
  const selectedRemote = typeof selected === 'string' && cloud.some((s) => s.provider === selected)
  const selectedLocal = typeof selected === 'string' && localProviders.includes(selected)
  const remote = cloud.find((s) =>
    selectedRemote ? s.provider === selected && same(s.model, model) : !selectedLocal && s.model === model
  )
  let provider: string | undefined
  if (remote) provider = remote.provider
  else if (selectedLocal)
    provider = candidates.find((s) => s.provider === selected)?.provider ?? candidates[0]?.provider
  else if (!selectedRemote && candidates.length === 1) provider = candidates[0]!.provider
  else if (!selectedRemote && candidates.length > 1)
    throw new AtcError(
      'ATC_USAGE',
      'This model ID is loaded in multiple engines. Unload the other instance before testing this endpoint.'
    )
  if (!provider) throw new AtcError('ATC_USAGE', 'Choose a ready model in Models, then retry.')
  if (requested && provider !== requested)
    throw new AtcError(
      'ATC_USAGE',
      `This model is served by ${provider}. Choose that provider or change the server selection.`
    )
  return provider
}
