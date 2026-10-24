import type { WorkspaceState } from '../state.js'
import { record } from './library-model.js'
import type { LibraryRow } from './library-model.js'
import { catalogModelMatches, localModelStatus } from '../../../workspace-view/index.js'

function matches(job: Record<string, unknown>, id: string) {
  const plan = record(job['plan'])
  return (
    plan['model_id'] === id ||
    String(plan['model_id'] ?? '').startsWith(id + ':') ||
    plan['repository'] === id ||
    record(job['request'])['repo'] === id
  )
}
const rank = (job: Record<string, unknown>) =>
  ['queued', 'downloading', 'verifying'].includes(String(job['stage'])) ? 3 : job['stage'] === 'ready' ? 2 : 1
/** A family retains the current quantized transfer, ahead of earlier attempts. */
export function modelJob(s: WorkspaceState, id: string) {
  return (s.workspace?.setups ?? [])
    .map(record)
    .filter((job) => matches(job, id))
    .reverse()
    .sort((a, b) => rank(b) - rank(a))[0]
}
export function modelInstalled(s: WorkspaceState, id: string) {
  const jobs = (s.workspace?.setups ?? []).map(record).filter((job) => matches(job, id))
  return (
    s.installed.some(
      (model) =>
        catalogModelMatches(model.id, id, s.workspace?.setups) ||
        jobs.some((job) => record(job['plan'])['model_id'] === model.id)
    ) ||
    jobs.some(
      (job) =>
        job['stage'] === 'ready' &&
        ['image', 'video', 'embedding', 'decision'].includes(String(record(job['plan'])['category']))
    )
  )
}

export function catalogDeviceStatus(s: WorkspaceState, model: LibraryRow) {
  const category = model.category || s.libraryCategory
  const kind = category === 'text' ? 'chat' : ['image', 'video'].includes(category) ? 'image-video' : category
  if (!['chat', 'image-video', 'embedding', 'decision'].includes(kind)) return ''
  const source = model.source ?? {}
  const fallback = String(
    source['engine'] ??
      source['provider'] ??
      (kind === 'image-video'
        ? 'sd-cpp'
        : source['format'] === 'mlx'
          ? 'mlx'
          : /prism|bonsai/i.test(model.id)
            ? 'atomic-prism'
            : 'llamacpp-upstream')
  )
  const providers = (values: string[]) =>
    values.filter(
      (provider) =>
        !s.catalogFilters.engine ||
        provider === s.catalogFilters.engine ||
        (s.catalogFilters.engine === 'llamacpp' && provider === 'llamacpp-upstream')
    )
  const files = s.installed.filter((file) => catalogModelMatches(file.id, model.id, s.workspace?.setups))
  const jobs = (s.workspace?.setups ?? []).map(record).filter((job) => matches(job, model.id))
  const candidates = [
    ...files.map((file) => ({
      model: file.id,
      providers: providers(file.providers?.length ? file.providers : [file.provider]),
    })),
    ...jobs.map((job) => ({
      model: String(record(job['plan'])['model_id'] ?? ''),
      providers: providers([String(record(job['plan'])['engine'] ?? fallback)]),
    })),
    { model: model.id, providers: providers([fallback]) },
    ...(s.workspace?.services ?? [])
      .filter((service) => catalogModelMatches(service.model, model.id, s.workspace?.setups))
      .map((service) => ({ model: service.model, providers: providers([fallback]) })),
  ]
  return localModelStatus(
    s.workspace,
    candidates.map((candidate) => ({
      ...candidate,
      kind: kind as 'chat' | 'image-video' | 'embedding' | 'decision',
    })),
    modelInstalled(s, model.id)
  )
}
