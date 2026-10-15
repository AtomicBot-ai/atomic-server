import { record } from '../types'
import type { RecordValue } from '../types'
export function mediaJob(value: unknown): RecordValue {
  const result = record(value)
  return 'job' in result ? record(result.job) : result
}
export function mediaDefaults(capabilities: RecordValue, task: string): RecordValue {
  const defaults = record(capabilities.defaults)
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
