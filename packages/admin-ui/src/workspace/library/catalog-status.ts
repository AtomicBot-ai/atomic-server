import { catalogModelMatches, localModelStatus } from '@view'
import type { WorkspaceSnapshot } from '@contract'
import type { RecordValue } from '../types'
import { modelCategory, modelFormat, modelId, modelProviders } from './catalog-models'

export function catalogStatus(
  snapshot: WorkspaceSnapshot | null | undefined,
  model: RecordValue,
  installed: RecordValue[],
  category: string,
  engine = ''
) {
  const id = modelId(model)
  const matches = (candidate: string) => catalogModelMatches(candidate, id, snapshot?.setups)
  const files = installed.filter((row) => modelCategory(row) === category && matches(modelId(row)))
  const kind = category === 'text' ? 'chat' : ['image', 'video'].includes(category) ? 'image-video' : category
  if (!['chat', 'image-video', 'embedding', 'decision'].includes(kind)) return ''
  const declared = modelProviders(model)
  const fallback = declared.length
    ? declared
    : [
        kind === 'image-video'
          ? 'sd-cpp'
          : modelFormat(model) === 'mlx'
            ? 'mlx'
            : /prism|bonsai/i.test(id)
              ? 'atomic-prism'
              : 'llamacpp-upstream',
      ]
  const providers = (row: RecordValue) => {
    const values = modelProviders(row)
    return (values.length ? values : fallback).filter(
      (value) => !engine || value === engine || (engine === 'llamacpp' && value === 'llamacpp-upstream')
    )
  }
  const candidates = [
    ...files.map((row) => ({ model: modelId(row), providers: providers(row) })),
    { model: id, providers: providers(model) },
    ...(snapshot?.services ?? [])
      .filter((service) => matches(service.model))
      .map((service) => ({ model: service.model, providers: providers(model) })),
    ...(snapshot?.loads ?? [])
      .filter((load) => matches(load.model_id))
      .map((load) => ({ model: load.model_id, providers: providers(model) })),
  ]
  return localModelStatus(
    snapshot,
    candidates.map((candidate) => ({
      ...candidate,
      kind: kind as 'chat' | 'image-video' | 'embedding' | 'decision',
    })),
    files.length > 0
  )
}
