import type { WorkspaceInput, WorkspaceSnapshot } from '../contract/index.js'
import { inferenceReadiness } from '../workspace-view/index.js'
import { AtcError } from '../errors/index.js'
import { object } from './validation.js'

export async function requireReadiness(
  operation: string,
  input: WorkspaceInput,
  snapshot: () => Promise<WorkspaceSnapshot>
) {
  if (!['api.start', 'api.restart', 'chat.start', 'chat.complete'].includes(operation)) return
  const chat = operation.startsWith('chat.'),
    request = object(input['request'])
  if (chat && (typeof request['model'] !== 'string' || !request['model'].trim()))
    throw new AtcError('ATC_USAGE', 'Choose a model to continue.')
  const readiness = inferenceReadiness(
    await snapshot(),
    chat
      ? {
          model: String(request['model'] ?? ''),
          ...(typeof input['provider'] === 'string' ? { provider: input['provider'] } : {}),
          kind: 'chat',
          requireApi: true,
        }
      : {}
  )
  if (!readiness.ready) throw new AtcError('ATC_USAGE', readiness.message)
}
