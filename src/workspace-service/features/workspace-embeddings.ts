import type { WorkspaceServiceOptions } from '../service.js'
import type { ClientKeys } from '../../terminal-data/index.js'
import { callPublic } from '../snapshot/public-api.js'
import { object } from '../validation.js'
import { AtcError } from '../../errors/index.js'
export async function embedWorkspaceDocuments(
  options: WorkspaceServiceOptions,
  keys: ClientKeys,
  input: string[],
  selected: string
) {
  const sessions = await options.link.models.sessions()
  const model = selected || sessions.find((session) => session.is_embedding)?.model_id
  if (!model || !sessions.some((session) => session.model_id === model && session.is_embedding))
    throw new AtcError('ATC_USAGE', 'Load an embedding model in Models before using document retrieval.')
  const response = await callPublic(
    options.link,
    options.config,
    keys,
    options.fetch ?? fetch,
    '/embeddings',
    { model, input }
  )
  const data = object(response.result)['data']
  if (!Array.isArray(data)) throw new AtcError('ATC_INTERNAL', 'Embedding model returned no vectors.')
  return data
    .sort((a, b) => Number(object(a)['index']) - Number(object(b)['index']))
    .map((row) => object(row)['embedding'] as number[])
}
