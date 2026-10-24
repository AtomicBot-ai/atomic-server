import type { WorkspaceServiceRow, WorkspaceSnapshot } from '../contract/index.js'

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
export function catalogModelMatches(candidate: string, family: string, setups: unknown[] = []): boolean {
  if (!candidate || !family) return false
  if (candidate === family || candidate.startsWith(family + '/') || candidate.startsWith(family + ':'))
    return true
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return setups.some((value) => {
    const job = object(value),
      plan = object(job['plan']),
      request = object(job['request'])
    return plan['model_id'] === candidate && (plan['repository'] === family || request['repo'] === family)
  })
}
