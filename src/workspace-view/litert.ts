/** LiteRT-LM as both UIs and the commands show it: a variant's backend, the core's verdict, the accelerator. */

import { formatSize } from './engines.js'

const PREPARE = 'atc engines accelerators litert-lm --prepare'
const INSTALL = 'atc engines install litert-lm'

/** `GPU`, `CPU`, `NPU (intel-lnl)`. */
export function liteRtVariantLabel(v: { backend: string; npu?: string | undefined }): string {
  return v.npu ? `${v.backend.toUpperCase()} (${v.npu})` : v.backend.toUpperCase()
}

/** The core's verdict on a variant, with the command that changes it where there is one. */
export function liteRtVerdictText(v: { verdict: string; reason: string | null }): string {
  if (v.verdict === 'ok') return 'ok'
  const hint =
    v.verdict === 'accelerator-not-prepared'
      ? ` (${PREPARE})`
      : v.verdict === 'engine-not-installed'
        ? ` (${INSTALL})`
        : ''
  return `${v.verdict}${v.reason ? ` — ${v.reason}` : ''}${hint}`
}

/** The accelerator's state as both UIs show it, one line each, as `atc engines accelerators litert-lm`. */
export function liteRtAcceleratorLines(view: {
  installed: boolean
  npu: string | null
  error: string | null
  accelerators: ReadonlyArray<{
    name: string
    version: string
    size_bytes: number
    prepared: boolean
    reason?: string
  }>
  preparing: boolean
  steps: ReadonlyArray<{ accelerator: string; stage: string; fraction: number | null; reason?: string }>
  last_error: string | null
}): string[] {
  if (!view.installed) return [`LiteRT-LM is not installed: ${INSTALL}`]
  const lines = [`NPU: ${view.npu ?? 'none LiteRT-LM targets'}`]
  if (view.error) lines.push(view.error)
  for (const a of view.accelerators)
    lines.push(
      `${a.name} ${a.version} (${formatSize(a.size_bytes)}): ${a.prepared ? 'prepared' : `not prepared — ${a.reason || PREPARE}`}`
    )
  if (!view.accelerators.length) lines.push('Nothing to prepare: models run on the CPU and GPU here.')
  if (view.preparing) lines.push('Preparing accelerators in the server…')
  for (const step of view.preparing ? view.steps : [])
    lines.push(
      `${step.accelerator}: ${step.stage}${step.fraction !== null && step.stage === 'downloading' ? ` ${Math.round(step.fraction * 100)}%` : ''}${step.reason ? ` — ${step.reason}` : ''}`
    )
  if (view.last_error) lines.push(`The last prepare failed: ${view.last_error}`)
  return lines
}
