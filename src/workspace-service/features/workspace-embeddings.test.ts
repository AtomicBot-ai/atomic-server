import { afterEach, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../config/index.js'
import { ClientKeys } from '../../terminal-data/index.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { embedWorkspaceDocuments } from './workspace-embeddings.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

async function setup(sessions: Array<{ model_id: string; is_embedding: boolean }>, answer: unknown) {
  const folder = tmpDataFolder()
  cleanup.push(folder.cleanup)
  const link = fakeCoreLink()
  link.snapshotValue.sessions = sessions as never
  link.snapshotValue.server.running = true
  const keys = new ClientKeys(folder.paths.atcDir)
  await keys.initialize('local-api-key')
  const request = vi.fn<typeof fetch>(async () => Response.json(answer))
  const options = { link, paths: folder.paths, config: defaultConfig(), fetch: request }
  return { options, keys, request }
}

it('embeds with the loaded embedding model through the local API and returns vectors in input order', async () => {
  const { options, keys, request } = await setup(
    [
      { model_id: 'chat', is_embedding: false },
      { model_id: 'nomic', is_embedding: true },
    ],
    {
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    }
  )
  expect(await embedWorkspaceDocuments(options, keys, ['a', 'b'], '')).toEqual([
    [1, 0],
    [0, 1],
  ])
  const [url, init] = request.mock.calls[0]!
  expect(url).toBe('http://127.0.0.1:1337/v1/embeddings')
  expect(JSON.parse(String(init?.body))).toEqual({ model: 'nomic', input: ['a', 'b'] })
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer local-api-key')
})

it('uses the model a person chose when it is a loaded embedding model', async () => {
  const { options, keys, request } = await setup(
    [
      { model_id: 'first', is_embedding: true },
      { model_id: 'second', is_embedding: true },
    ],
    { data: [{ index: 0, embedding: [2] }] }
  )
  await embedWorkspaceDocuments(options, keys, ['a'], 'second')
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body)).model).toBe('second')
})

it.each([
  ['no embedding model is loaded', [{ model_id: 'chat', is_embedding: false }], ''],
  ['the chosen model is not loaded', [{ model_id: 'nomic', is_embedding: true }], 'other'],
  ['the chosen model is a chat model', [{ model_id: 'chat', is_embedding: false }], 'chat'],
])('asks for an embedding model when %s', async (_, sessions, selected) => {
  const { options, keys, request } = await setup(sessions, {})
  await expect(embedWorkspaceDocuments(options, keys, ['a'], selected)).rejects.toMatchObject({
    code: 'ATC_USAGE',
    message: 'Load an embedding model in Models before using document retrieval.',
  })
  expect(request).not.toHaveBeenCalled()
})

it('reports an answer without vectors as an internal error', async () => {
  const { options, keys } = await setup([{ model_id: 'nomic', is_embedding: true }], { object: 'list' })
  await expect(embedWorkspaceDocuments(options, keys, ['a'], '')).rejects.toMatchObject({
    code: 'ATC_INTERNAL',
    message: 'Embedding model returned no vectors.',
  })
})
