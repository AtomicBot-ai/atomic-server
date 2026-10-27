import type { WorkspaceInput, WorkspaceSnapshot } from '../../contract/index.js'
import { inferenceReadiness } from '../../workspace-view/index.js'
import { AtcError } from '../../errors/index.js'
import { object } from '../validation.js'

export async function requireReadiness(
  operation: string,
  input: WorkspaceInput,
  snapshot: () => Promise<WorkspaceSnapshot>
) {
  // Only chat: the API serves without a model (`atc api start`, `api.autoStart`), so a Start with
  // nothing loaded is the UIs' hint to give, not an error.
  if (!['chat.start', 'chat.complete'].includes(operation)) return
  const request = object(input['request'])
  if (typeof request['model'] !== 'string' || !request['model'].trim())
    throw new AtcError('ATC_USAGE', 'Choose a model to continue.')
  const readiness = inferenceReadiness(await snapshot(), {
    model: request['model'],
    ...(typeof input['provider'] === 'string' ? { provider: input['provider'] } : {}),
    kind: 'chat',
    requireApi: true,
  })
  if (!readiness.ready) throw new AtcError('ATC_USAGE', readiness.message)
}
