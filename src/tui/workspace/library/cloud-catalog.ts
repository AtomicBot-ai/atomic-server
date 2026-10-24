import { CLOUD_CATALOG } from '../../../contract/index.js'
import type { CloudDraft } from '../../../contract/index.js'
export function cloudNeedsKey(provider: string) {
  return (
    CLOUD_CATALOG.some((p) => p.id === provider) &&
    !['llamacpp-server', 'automatic1111', 'sdcpp-server'].includes(provider)
  )
}
export function cloudChoices(cloud: CloudDraft) {
  return [
    ...CLOUD_CATALOG.map((p) => ({ ...p, saved: cloud.providers.find((v) => v.provider === p.id) })),
    ...cloud.providers
      .filter((p) => !CLOUD_CATALOG.some((v) => v.id === p.provider))
      .map((p) => ({ id: p.provider, name: p.provider, icon: '[+]', url: p.base_url ?? '', saved: p })),
    { id: '', name: 'Custom provider', icon: '[+]', url: '', saved: undefined },
  ]
}
