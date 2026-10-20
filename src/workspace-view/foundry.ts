/** Foundry Local as a person reads it: variant and accelerator names, the library's accelerators, verdicts. */

import type { FoundryAcceleratorsView } from '../contract/index.js'

const LABELS: Readonly<Record<string, string>> = {
  cpu: 'CPU',
  cuda: 'CUDA',
  webgpu: 'WebGPU',
  openvino: 'OpenVINO',
  qnn: 'QNN',
  vitisai: 'Vitis AI',
}
const PREPARE = 'atc engines accelerators foundry-local --prepare'
const INSTALL = 'atc engines install foundry-local'

/** How a variant is named: its accelerator, and the device where the accelerator has more than one. */
export function variantLabel(v: { execution_provider: string; device: string }): string {
  const accelerator = LABELS[v.execution_provider] ?? v.execution_provider
  return v.device === 'npu' || (v.execution_provider === 'openvino' && v.device === 'gpu')
    ? `${accelerator} ${v.device.toUpperCase()}`
    : accelerator
}

/** An accelerator as a person names it: its execution provider and device (`OpenVINO NPU`, `CPU`). */
export function acceleratorLabel(a: {
  name: string
  execution_provider: string | null
  device: string
}): string {
  if (a.execution_provider === null) return a.name
  if (a.execution_provider === 'cpu') return 'CPU'
  return `${LABELS[a.execution_provider] ?? a.execution_provider} ${a.device.toUpperCase()}`
}

/** What the library found: each accelerator prepared or not, a prepare running, the last one's failure. */
export function acceleratorLines(view: FoundryAcceleratorsView): string[] {
  if (!view.installed) return [`Foundry Local is not installed: ${INSTALL}`]
  if (view.error && view.accelerators.length === 0) return [`The library was not probed: ${view.error}`]
  const lines = view.accelerators.map((a) => {
    if (a.execution_provider === null) return `${a.name}: not offered${a.reason ? ` (${a.reason})` : ''}`
    return `${acceleratorLabel(a)}: ${a.prepared ? 'prepared' : `not prepared — ${PREPARE}`}`
  })
  if (!view.accelerators.some((a) => a.execution_provider !== null && a.execution_provider !== 'cpu'))
    lines.push('Models run on the CPU; nothing needs preparing.')
  if (view.preparing) lines.push('Preparing accelerators in the server…')
  for (const step of view.preparing ? (view.steps ?? []) : [])
    lines.push(
      `${step.accelerator}: ${step.stage}${step.fraction !== null && step.stage === 'downloading' ? ` ${Math.round(step.fraction * 100)}%` : ''}${step.reason ? ` — ${step.reason}` : ''}`
    )
  if (view.last_error) lines.push(`The last prepare failed: ${view.last_error}`)
  return lines
}

/** A prepare's summary, one accelerator a line. */
export function prepareResultLines(result: {
  accelerators: ReadonlyArray<{ name: string; prepared: boolean; reason?: string }>
}): string[] {
  return result.accelerators.map(
    (a) => `${a.name}: ${a.prepared ? 'prepared' : `not prepared${a.reason ? ` — ${a.reason}` : ''}`}`
  )
}

/** The core's verdict on a variant, with the command that changes it where there is one. */
export function foundryVerdictText(v: { verdict: string; reason: string | null }): string {
  if (v.verdict === 'ok') return 'ok'
  const hint =
    v.verdict === 'accelerator-not-prepared'
      ? ` (${PREPARE})`
      : v.verdict === 'engine-not-installed'
        ? ` (${INSTALL})`
        : ''
  return `${v.verdict}${v.reason ? ` — ${v.reason}` : ''}${hint}`
}
