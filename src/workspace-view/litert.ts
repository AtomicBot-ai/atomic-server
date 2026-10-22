/** LiteRT-LM as both UIs and the commands show it: a variant's backend, and the core's verdict on it. */

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
