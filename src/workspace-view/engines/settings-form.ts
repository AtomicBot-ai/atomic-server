/**
 * A provider's settings form, shared by the terminal, the web admin and `atc config` (spec
 * server-engine-settings): the fields of the core's schema except the engine build (`version_backend`,
 * chosen with `engines.activate`), each value as typed text, a raw value checked against its descriptor,
 * and only what changed sent with the revision read when the form opened.
 */

import type { GpuFacts, SettingDescriptor } from '@atomic-chat/core/contracts'
import { formatSize } from './engines.js'

const TRUE = new Set(['true', 'on', 'yes', '1'])
const FALSE = new Set(['false', 'off', 'no', '0'])

/** The typed value of `raw` for a descriptor, or why it is not one. */
export function parseSettingValue(d: SettingDescriptor, raw: string): { value: unknown } | { error: string } {
  const props = d.controllerProps
  if (d.controllerType === 'checkbox') {
    const word = raw.trim().toLowerCase()
    if (TRUE.has(word)) return { value: true }
    if (FALSE.has(word)) return { value: false }
    return { error: `${d.key} is true or false.` }
  }
  if (d.controllerType === 'dropdown') {
    const options = Array.isArray(props['options'])
      ? (props['options'] as Array<{ value: unknown }>).map((o) => String(o.value))
      : []
    if (options.length === 0 || options.includes(raw)) return { value: raw }
    return { error: `${d.key} is one of ${options.join(', ')}.` }
  }
  if (props['type'] !== 'number') return { value: raw }
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(value)) return { error: `${d.key} is a number.` }
  const min = typeof props['min'] === 'number' ? props['min'] : undefined
  const max = typeof props['max'] === 'number' ? props['max'] : undefined
  if ((min !== undefined && value < min) || (max !== undefined && value > max))
    return {
      error:
        min !== undefined && max !== undefined
          ? `${d.key} is between ${min} and ${max}.`
          : min !== undefined
            ? `${d.key} is at least ${min}.`
            : `${d.key} is at most ${max}.`,
    }
  return { value }
}

/** Every field a form edits: the schema without `version_backend`. */
export const formFields = (descriptors: readonly SettingDescriptor[]) =>
  // core-boundary: version_backend — left out of every form; the build goes through engines.activate
  descriptors.filter((d) => d.key !== 'version_backend')

/** The value a field holds in the form: the draft's, else the core's, else the schema's default. */
export function fieldValue(
  d: SettingDescriptor,
  values: Readonly<Record<string, unknown>>,
  draft: Readonly<Record<string, unknown>> = {}
): unknown {
  return d.key in draft ? draft[d.key] : d.key in values ? values[d.key] : d.controllerProps.value
}

/** A card as a person picks it: name, compute capability, memory. */
export const gpuLabel = (g: GpuFacts) =>
  `${g.name} (CC ${g.compute_capability}${g.total_vram_bytes ? `, ${formatSize(g.total_vram_bytes)}` : ''})`

/** A field's value as text; `gpu_id` by its card, empty as the card with the most free memory. */
export function fieldText(d: SettingDescriptor, value: unknown, gpus: readonly GpuFacts[] = []): string {
  if (d.controllerType === 'checkbox') return value === true ? 'on' : 'off'
  if (d.key === 'gpu_id') {
    if (!value) return 'Card with the most free memory'
    const gpu = gpus.find((g) => g.gpu_id === value)
    return gpu ? gpuLabel(gpu) : String(value)
  }
  if (d.controllerType === 'dropdown') {
    const options = Array.isArray(d.controllerProps['options'])
      ? (d.controllerProps['options'] as Array<{ value: unknown; name?: string }>)
      : []
    return options.find((o) => String(o.value) === String(value))?.name ?? String(value ?? '')
  }
  return value === undefined || value === null ? '' : String(value)
}

/** The draft's keys whose value differs from the stored value or the displayed schema default. */
export function changedValues(
  values: Readonly<Record<string, unknown>>,
  draft: Readonly<Record<string, unknown>>,
  descriptors: readonly { key?: unknown; controllerProps?: unknown }[] = []
): Record<string, unknown> {
  const defaults = new Map(
    descriptors.map((field) => [
      field.key,
      field.controllerProps && typeof field.controllerProps === 'object'
        ? (field.controllerProps as Record<string, unknown>)['value']
        : undefined,
    ])
  )
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([k, v]) => JSON.stringify(k in values ? values[k] : defaults.get(k)) !== JSON.stringify(v)
    )
  )
}
