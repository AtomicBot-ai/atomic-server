import { record, rows, text } from '../types'
import type { RecordValue } from '../types'

export type CatalogFilters = { engine: string; liked: boolean; downloaded: boolean; uncensored: boolean }
export const initialCatalogFilters: CatalogFilters = {
  engine: '',
  liked: false,
  downloaded: false,
  uncensored: false,
}

/** Artifact IDs address installation jobs; model IDs address the downloaded model. */
export function modelId(model: RecordValue): string {
  return text(model.model_id ?? record(model.plan).model_id ?? model.id ?? model.model_name ?? model.repo, '')
}

export function modelCategory(model: RecordValue): string {
  return text(model.category ?? record(model.plan).category, 'text')
}

export function modelProviders(model: RecordValue): string[] {
  const source = record(model.source),
    plan = record(model.plan)
  const values = model.providers ?? model.engines ?? source.providers ?? source.engines
  const providers = Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : []
  return [
    ...new Set([
      ...providers,
      ...[model.provider, model.engine, plan.engine, source.provider, source.engine].filter(
        (v): v is string => typeof v === 'string' && Boolean(v)
      ),
    ]),
  ]
}

export function modelFormat(model: RecordValue): string {
  const explicit = text(model.format ?? record(model.source).format, '').toLowerCase()
  if (explicit) return explicit === 'foundry local' ? 'foundry' : explicit
  const providers = modelProviders(model)
  if (providers.includes('mlx')) return 'mlx'
  if (providers.includes('foundry-local')) return 'foundry'
  if (model.store === 'managed' || providers.some((p) => ['vllm', 'sglang', 'tensorrt-llm'].includes(p)))
    return 'safetensors'
  return modelCategory(model) === 'text' ? 'gguf' : ''
}

export function matchesCatalogModel(installedId: string, catalogId: string): boolean {
  return (
    Boolean(catalogId) &&
    (installedId === catalogId ||
      installedId.startsWith(`${catalogId}/`) ||
      installedId.startsWith(`${catalogId}:`))
  )
}

/** Preserve the job ID for load/delete while making raw artifact metadata available to the catalog. */
export function installedModels(chat: unknown, artifacts: unknown): RecordValue[] {
  const models = new Map<string, RecordValue>()
  const key = (model: RecordValue) => `${modelCategory(model)}:${modelId(model)}`
  for (const model of rows(chat)) models.set(key(model), model)
  for (const artifact of rows(artifacts).filter((model) => model.stage === 'ready')) {
    const plan = record(artifact.plan)
    const model: RecordValue = {
      ...artifact,
      model_id: modelId(artifact),
      name: artifact.name ?? plan.name,
      category: modelCategory(artifact),
      engine: artifact.engine ?? plan.engine,
      size_bytes: artifact.size_bytes ?? plan.total_download_bytes,
    }
    const previous = models.get(key(model))
    if (!previous?.plan || Number(model.updated_at ?? 0) >= Number(previous.updated_at ?? 0))
      models.set(key(model), { ...previous, ...model })
  }
  return [...models.values()]
}

export function modelLikes(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}
