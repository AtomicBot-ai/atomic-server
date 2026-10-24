import type { WorkspaceState } from '../state.js'
import { record } from '../library/library-model.js'
import { defaultInput, fieldValue, inputObject, operationFields } from '../operations/operation-model.js'

export interface MediaStudioState {
  task: string
  capabilities: Record<string, unknown>
  job: Record<string, unknown> | null
  gallery: Record<string, unknown>[]
  models: Record<string, unknown>[]
  selected: number
  advanced: boolean
  galleryView: boolean
  loading: boolean
  error: string
}
export const initialMedia = (): MediaStudioState => ({
  task: '',
  capabilities: {},
  job: null,
  gallery: [],
  models: [],
  selected: 0,
  advanced: false,
  galleryView: false,
  loading: false,
  error: '',
})
export const mediaTask = (s: WorkspaceState) =>
  s.page === 'tools' && /^task:(image|video)$/.test(s.toolGroup) ? s.toolGroup.slice(5) : ''
export const pendingMedia = (s: WorkspaceState) =>
  ['queued', 'generating', 'running', 'pending'].includes(String(s.media.job?.['state']))
export function loadedMediaModel(s: WorkspaceState) {
  const task = mediaTask(s)
  return s.workspace?.services.find((service) => {
    if (service.kind !== 'image-video' || !['ready', 'loaded'].includes(service.state)) return false
    const details = record(service.details),
      loaded = record(record(details['model'])['loaded'] ?? details['loadedModel'])
    return (loaded['modality'] ?? details['modality'] ?? 'image') === task
  })?.model
}
export const mediaJob = (value: unknown) => {
  const result = record(value)
  return 'job' in result ? record(result['job']) : result
}
export const mediaRows = (value: unknown) => {
  const result = record(value),
    rows = Array.isArray(value) ? value : result['rows']
  return Array.isArray(rows) ? rows.map(record) : []
}
export function mediaFields(s: WorkspaceState) {
  const op = s.operations.find((entry) => entry.name === s.operation)
  const workflow = fieldValue(s.operationInput, 'request.workflow') ?? 'create'
  const visible = [
    'workflow',
    'prompt',
    ...(s.media.capabilities['supportsNegativePrompt'] ? ['negativePrompt'] : []),
    ...(workflow !== 'create' ? ['initImage', 'strength'] : []),
    ...(['inpaint', 'extend'].includes(String(workflow)) ? ['maskImage'] : []),
    'width',
    'height',
    ...(mediaTask(s) === 'video' ? ['frames', 'fps'] : []),
    'steps',
    'cfgScale',
    ...(s.media.capabilities['supportsGuidance'] ? ['guidance'] : []),
    ...(mediaTask(s) === 'image' ? ['batchSize'] : []),
    'seed',
  ]
  return (op ? operationFields(op) : [])
    .filter((field) => visible.includes(field.path.replace('request.', '')))
    .sort(
      (a, b) =>
        visible.indexOf(a.path.replace('request.', '')) - visible.indexOf(b.path.replace('request.', ''))
    )
}
export const MEDIA_LABELS: Record<string, string> = {
  workflow: 'Mode',
  prompt: 'Prompt',
  negativePrompt: 'Negative prompt',
  initImage: 'Source image',
  maskImage: 'Mask image',
  strength: 'Strength',
  width: 'Width',
  height: 'Height',
  frames: 'Frames',
  fps: 'Frame rate',
  steps: 'Steps',
  cfgScale: 'CFG scale',
  guidance: 'Guidance',
  batchSize: 'Images',
  seed: 'Seed',
}

/** Draft values come from the shared operation schema until a model supplies its defaults. */
export function mediaRequestDefaults(s: WorkspaceState, capabilities = s.media.capabilities) {
  const operation = s.operations.find((entry) => entry.name === s.operation)
  const values = operation ? record(inputObject(defaultInput(operation, s))['request']) : {}
  const defaults = record(capabilities['defaults'])
  for (const key of ['width', 'height', 'steps', 'cfgScale', 'guidance', 'samplingMethod', 'flowShift'])
    if (defaults[key] !== undefined) values[key] = defaults[key]
  if (mediaTask(s) === 'video') {
    const frames = record(capabilities['frames'])['default'] ?? record(defaults['video'])['frames']
    const fps = capabilities['fps'] ?? record(defaults['video'])['fps']
    if (frames !== undefined) values['frames'] = frames
    if (fps !== undefined) values['fps'] = fps
  }
  return values
}
