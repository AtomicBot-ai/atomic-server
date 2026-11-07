import { FastFlowLmHostSteps } from '../../host/index.js'
import { ModelRegistry } from '@atomic-chat/core/models'
import type { WorkspaceInput } from '../../contract/index.js'
import type { WorkspaceServiceOptions } from '../service-options.js'
import { NOT_CORE } from '../not-core.js'
import { flmCatalog } from './catalog.js'
import type { FlmSetups } from './setups.js'

export async function flmOperation(
  o: WorkspaceServiceOptions,
  setups: FlmSetups,
  name: string,
  input: WorkspaceInput
) {
  const base = '/runtimes/fastflowlm',
    id = encodeURIComponent(String(input['id']))
  const post = (path: string, body: unknown = {}) => o.link.request('POST', path, body)
  if ((name === 'models.catalog' || name === 'models.search') && input['engine'] === 'fastflowlm')
    return flmCatalog(o, String(input['query'] ?? ''), input['refresh'] === true)
  if (name === 'models.remove' && input['store'] === 'fastflowlm')
    return setups.remove(String(input['model_id']))
  switch (name) {
    case 'fastflowlm.host-steps':
      return FastFlowLmHostSteps.pending(o.paths.atcDir, await o.link.request('GET', base + '/operations'))
    case 'fastflowlm.accelerators':
      return o.link.request('GET', base + '/accelerators')
    case 'fastflowlm.probe':
      return post(base + '/probe')
    case 'fastflowlm.operations':
      return o.link.request('GET', base + '/operations')
    case 'fastflowlm.prepare':
      return post(base + '/operations', { request_id: input['request_id'] })
    case 'fastflowlm.status':
      return o.link.request('GET', base + '/operations/' + id)
    case 'fastflowlm.consent':
      return post(base + '/operations/' + id + '/consent', {
        expected_revision: input['expected_revision'],
        approved_plan_digest: input['approved_plan_digest'],
      })
    case 'fastflowlm.resume':
      return post(base + '/operations/' + id + '/resume', { expected_revision: input['expected_revision'] })
    case 'fastflowlm.stop':
      return post(base + '/operations/' + id + '/cancel')
    case 'fastflowlm.plan':
      return setups.plan(
        String(input['model']),
        input['refresh'] === true,
        typeof input['variant'] === 'string' ? input['variant'] : undefined
      )
    case 'fastflowlm.install':
      return setups.journal.install(input)
    case 'fastflowlm.cancel':
      return setups.journal.cancel(String(input['id']))
  }
  return NOT_CORE
}
export async function flmInstalled(o: WorkspaceServiceOptions) {
  return (await new ModelRegistry(o.paths.layout, 'fastflowlm').list()).map(({ id, yml }) => ({
    id,
    name: String(yml.name ?? id),
    provider: 'fastflowlm',
    store: 'fastflowlm',
    size_bytes: yml.size_bytes,
    tools: yml.fastflowlm?.capabilities.tools === true,
    vision: false,
  }))
}
