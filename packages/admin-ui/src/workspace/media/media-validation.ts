import { record } from '../types'
import type { RecordValue } from '../types'

const fallback: Record<string, { min: number; max: number; step: number }> = {
  frames: { min: 1, max: 161, step: 1 },
  steps: { min: 1, max: 50, step: 1 },
  cfgScale: { min: 1, max: 20, step: 0.5 },
  guidance: { min: 0, max: 20, step: 0.5 },
  strength: { min: 0, max: 1, step: 0.05 },
  batchSize: { min: 1, max: 1, step: 1 },
}

/** The same capability-derived bounds drive controls and inline explanations. */
export function mediaBounds(capabilities: RecordValue, name: string) {
  const dimension = name === 'width' || name === 'height'
  const base = dimension
    ? {
        min: capabilities.minDim ?? 64,
        max: capabilities.maxDim ?? 8192,
        step: capabilities.dimMultiple ?? 16,
      }
    : { ...fallback[name], ...(name === 'batchSize' ? { max: capabilities.maxBatch ?? 1 } : {}) }
  const limits = record(capabilities[name])
  const range = record(capabilities.ranges)[name]
  const bounds = Array.isArray(range) ? range : []
  return {
    min: Number(limits.min ?? bounds[0] ?? base.min),
    max: Number(limits.max ?? bounds[1] ?? base.max),
    step: Number(limits.step ?? base.step),
  }
}

export function mediaFieldError(capabilities: RecordValue, name: string, value: unknown) {
  // An omitted optional parameter lets the model choose its own default.
  if (value === undefined || value === '') return ''
  const { min, max, step } = mediaBounds(capabilities, name)
  const number = Number(value)
  if (!Number.isFinite(number) || number < min || number > max)
    return `Use a value from ${min} to ${max} for this model. Your value has been kept.`
  const offset = (number - min) / step
  if (step > 0 && Math.abs(offset - Math.round(offset)) > 1e-7)
    return `Use increments of ${step} from ${min} for this model. Your value has been kept.`
  return ''
}

export function mediaFormErrors(capabilities: RecordValue, values: RecordValue, task: string) {
  const fields = [
    'width',
    'height',
    'steps',
    'cfgScale',
    task === 'image' ? 'batchSize' : 'frames',
    ...(capabilities.supportsGuidance ? ['guidance'] : []),
    ...(task === 'image' && values.workflow !== 'create' ? ['strength'] : []),
  ]
  return Object.fromEntries(
    fields.flatMap((name) => {
      const message = mediaFieldError(capabilities, name, values[name])
      return message ? [[name, message]] : []
    })
  )
}
