import type { WorkspaceServiceRow, WorkspaceSnapshot } from '../../contract/index.js'

export type LocalModelIdentity = {
  model: string
  providers: readonly string[]
  kind: WorkspaceServiceRow['kind']
}
export type ModelDeviceStatus = '' | 'Downloaded' | 'Loading…' | 'Loaded'

/** Local files and remote discovery are not evidence of a loaded inference session. */
export function localModelStatus(
  snapshot: Pick<WorkspaceSnapshot, 'services' | 'loads'> | null | undefined,
  identities: readonly LocalModelIdentity[],
  downloaded = false
): ModelDeviceStatus {
  const services = (snapshot?.services ?? []).filter(
    (service) =>
      !service.details?.['cloud'] &&
      identities.some(
        (identity) =>
          identity.model === service.model &&
          identity.kind === service.kind &&
          identity.providers.includes(service.provider)
      )
  )
  if (services.some((service) => ['ready', 'loaded', 'running'].includes(service.state))) return 'Loaded'
  if (
    services.some((service) => /^(loading|preparing|starting|restarting)$/.test(service.state)) ||
    (snapshot?.loads ?? []).some(
      (load) =>
        load.stage !== 'ready' &&
        identities.some(
          (identity) =>
            identity.kind === 'chat' &&
            identity.model === load.model_id &&
            identity.providers.includes(load.provider)
        )
    )
  )
    return 'Loading…'
  return downloaded ? 'Downloaded' : ''
}

/** A catalog family can own a filename, quantized variant or a recorded repository download. */
/** `-Q4_K_M`, `-UD-Q4_K_XL`, `-IQ4_XS`, `-F16`, `-BF16`: a file's quantization, as Hub files are named. */
const QUANT_SUFFIX = /^(?:\/[^/]*)?-(?:UD-)?(?:I?Q\d[\w.]*|B?F16|F32)$/i

export function catalogModelMatches(
  candidate: string,
  family: string,
  setups: unknown[] = [],
  /** The catalog row the installed model was downloaded from, when the registry records it. */
  repository?: string
): boolean {
  if (!candidate || !family) return false
  if (candidate === family || candidate.startsWith(family + '/') || candidate.startsWith(family + ':'))
    return true
  if (repository === family) return true
  // A GGUF download made before the registry recorded its repository is `owner/<file without .gguf>`:
  // the row `owner/name-GGUF` names it when what follows `name` is a quantization, not another model.
  const base = /^([^/]+\/.+)-gguf$/i.exec(family)?.[1]
  if (base && candidate.startsWith(base) && QUANT_SUFFIX.test(candidate.slice(base.length))) return true
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return setups.some((value) => {
    const job = object(value),
      plan = object(job['plan']),
      request = object(job['request'])
    return plan['model_id'] === candidate && (plan['repository'] === family || request['repo'] === family)
  })
}
