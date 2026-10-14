import { randomUUID } from 'node:crypto'
import type { CoreLink } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'
import { object, segment } from './validation.js'
/** A fresh engine has no update offer: choose its catalog recommendation before installing. */
export async function installEngine(link: CoreLink, engine: string, request: Record<string, unknown> = {}) {
  if (['tensorrt-llm', 'vllm'].includes(engine)) {
    const versions = await link.request<{ engines: Array<{ engine: string; active: unknown }> }>(
      'POST',
      '/engines/versions',
      {}
    )
    if (!versions.engines.find((e) => e.engine === engine)?.active)
      throw new AtcError(
        'ATC_USAGE',
        'Prepare this managed engine through environments.probe, then environments.begin using the reviewed plan.',
        { hint: 'Managed host steps require the plan digest and explicit approval.' }
      )
    return link.request('POST', `/engines/${segment(engine)}/update`, {
      request_id: randomUUID(),
      ...request,
    })
  }
  const body = { task_id: randomUUID(), ...request }
  if (['sd-cpp', 'mlx'].includes(engine))
    return link.request('POST', `/engines/${segment(engine)}/update`, body)
  if (!['llamacpp-upstream', 'llamacpp', 'atomic-prism'].includes(engine))
    throw new AtcError('ATC_USAGE', 'Choose an installed-platform engine from engines.list.')
  if (!request['target']) {
    const catalog = await link.request<{
      recommended: string | null
      available: Array<{ version: string; backend: string }>
    }>('POST', `/backends/${engine}/catalog`, {})
    const choice =
      catalog.available.find((b) => `${b.version}/${b.backend}` === catalog.recommended) ??
      catalog.available[0]
    if (!choice) throw new AtcError('ATC_USAGE', 'No compatible engine build is available.')
    return link.request('POST', `/engines/${engine}/update`, {
      ...body,
      target: { version: choice.version, variant: choice.backend },
    })
  }
  return link.request('POST', `/engines/${engine}/update`, body)
}
export async function ensureArtifactEngine(link: CoreLink, engine: string, taskId: string) {
  if (['llamacpp', 'llamacpp-upstream', 'atomic-prism'].includes(engine)) {
    const installed = await link.request<{ backends: unknown[] }>('GET', `/backends/${engine}`)
    if (installed.backends.length) return
  } else if (['sd-cpp', 'mlx'].includes(engine)) {
    const catalog = await link.request<Record<string, unknown>>(
      'POST',
      `/engine-builds/${engine}/catalog`,
      {}
    )
    if (Object.keys(object(catalog['active'])).length) return
  }
  await installEngine(link, engine, { task_id: taskId })
}
