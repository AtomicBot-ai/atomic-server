import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ModelRegistry } from '@atomic-chat/core/models'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'
import { writeDocument } from '../../terminal-data/index.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
const id = 'mlx-community/tiny',
  sha = 'a'.repeat(40)

function fixture() {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'mlx' }] }
  const request = (async (input: unknown) => {
    const url = String(input)
    if (url.includes('raw.githubusercontent.com'))
      return Response.json({ picks: [{ model_name: id, title: 'Tiny MLX', format: 'mlx' }] })
    if (url.endsWith(`/api/models/${id}`)) return Response.json({ sha })
    if (url.includes('/tree/'))
      return Response.json([
        { type: 'file', path: 'config.json', size: 2 },
        { type: 'file', path: 'model.safetensors', size: 2 },
      ])
    return new Response('{}', { headers: { 'content-length': '2' } })
  }) as typeof fetch
  const options = { paths: tmp.paths, link, config: defaultConfig(), fetch: request }
  const service = new WorkspaceService(options)
  return { tmp, options, service }
}

it('lists a completed MLX download as installed before any load, including after reconnect', async () => {
  const { tmp, options, service } = fixture()
  const plan = (await service.execute('artifacts.plan', { category: 'text', model_id: id })) as {
    digest: string
  }
  await service.execute('artifacts.install', { plan_digest: plan.digest, request_id: 'mlx-install' })
  await vi.waitFor(async () =>
    expect(await service.execute('artifacts.list')).toMatchObject([{ stage: 'ready' }])
  )
  expect(await service.execute('models.installed')).toContainEqual(
    expect.objectContaining({ id, provider: 'mlx' })
  )
  expect(await new ModelRegistry(tmp.paths.layout, 'mlx').find(id)).not.toBeNull()
  expect(await new WorkspaceService(options).execute('models.installed')).toContainEqual(
    expect.objectContaining({ id })
  )
})

it('registers an older completed job at startup, but leaves cancelled and missing downloads alone', async () => {
  const { tmp, service } = fixture()
  const plan = (await service.execute('artifacts.plan', { category: 'text', model_id: id })) as Record<
    string,
    unknown
  >
  const root = join(tmp.paths.dataFolder, 'workspace-models/mlx', id)
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'config.json'), '{}')
  await writeFile(join(root, 'model.safetensors'), '{}')
  const job = { id: 'old-mlx', stage: 'ready', plan, updated_at: 1 }
  const directory = join(tmp.paths.atcDir, 'media-installations')
  await writeDocument(join(directory, 'old-mlx.json'), job)
  await writeDocument(join(directory, 'cancelled.json'), {
    ...job,
    id: 'cancelled',
    stage: 'cancelled',
    plan: { ...plan, model_id: 'owner/cancelled' },
  })
  await writeDocument(join(directory, 'missing.json'), {
    ...job,
    id: 'missing',
    plan: { ...plan, model_id: 'owner/missing', files: [{ save_path: 'missing.safetensors', size: 2 }] },
  })
  await service.start()
  expect(await service.execute('models.installed')).toEqual([
    expect.objectContaining({ id, provider: 'mlx' }),
  ])
  await new ModelRegistry(tmp.paths.layout, 'mlx').remove(id)
  await service.start()
  expect(await service.execute('models.installed')).toEqual([])
})
