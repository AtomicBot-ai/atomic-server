import { WORKSPACE_OPERATIONS, type WorkspaceServiceRow } from '@contract'
import { record } from '../types'
import type { RecordValue } from '../types'
export function mediaJob(value: unknown): RecordValue {
  const result = record(value)
  return 'job' in result ? record(result.job) : result
}
export function mediaDefaults(capabilities: RecordValue, task: string): RecordValue {
  const properties = WORKSPACE_OPERATIONS.find((operation) => operation.name === `media.${task}.create`)
    ?.inputSchema.properties.request.properties
  const initial = Object.fromEntries(
    Object.entries(properties ?? {}).flatMap(([name, field]) =>
      field.default === undefined ? [] : [[name, field.default]]
    )
  )
  const defaults = { ...initial, ...record(capabilities.defaults) }
  const video = record(defaults.video)
  const values: RecordValue = {
    prompt: '',
    workflow: 'create',
    width: defaults.width,
    height: defaults.height,
    steps: defaults.steps,
    cfgScale: defaults.cfgScale,
  }
  for (const field of ['guidance', 'samplingMethod', 'flowShift'])
    if (defaults[field] !== undefined) values[field] = defaults[field]
  if (task === 'video') {
    values.frames = record(capabilities.frames).default ?? video.frames
    values.fps = capabilities.fps ?? video.fps
  } else values.batchSize = 1
  return values
}

/** Image and video share a runtime, but its loaded model supports one modality. */
export function mediaServiceMatches(service: WorkspaceServiceRow, task: string): boolean {
  if (service.kind !== 'image-video' || !['ready', 'loaded'].includes(service.state)) return false
  const details = record(service.details)
  const loaded = record(record(details.model).loaded ?? details.loadedModel)
  const modality = loaded.modality ?? details.modality
  // Pre-modality status formats only supported image generation.
  return (modality ?? 'image') === task
}
