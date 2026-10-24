import { ModelRegistry } from '@atomic-chat/core/models'
import { readFile, stat, mkdir, writeFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { cleanup, fixture, install, settle, weights } from '../../test/helpers/model-setups-fixture.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import { defaultConfig } from '../config/index.js'
import { WorkspaceService } from './service.js'
import { removeDownload } from './download-removal.js'
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
it('pauses without losing partial bytes, then removes a stopped GGUF download and its durable record', async () => {
  const f = fixture(),
    setups = f.make()
  f.hub.hold = true
  const job = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
  await waitFor(() => (f.downloader.snapshot()[0]?.transferred ?? 0) === weights.length / 2)
  await setups.cancel(job.setup_id)
  const path = join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M/model.Q4_K_M.gguf')
  expect((await stat(`${path}.tmp`)).size).toBe(weights.length / 2)
  await removeDownload(
    { setups } as never,
    { paths: f.tmp.paths } as never,
    { owner: 'setup', id: job.setup_id },
    async () => ({ services: [], errors: [] })
  )
  await expect(stat(`${path}.tmp`)).rejects.toThrow()
  expect(await setups.list()).toEqual([])
  expect(f.downloader.active()).toEqual([])
})
it('protects a completed GGUF model and its installation record', async () => {
  const f = fixture(),
    setups = f.make(),
    job = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
  await settle(setups, job.setup_id)
  await expect(
    removeDownload(
      { setups } as never,
      { paths: f.tmp.paths } as never,
      { owner: 'setup', id: job.setup_id },
      async () => ({ services: [], errors: [] })
    )
  ).rejects.toThrow('Installed models')
  expect((await setups.list())[0]?.stage).toBe('ready')
})
it('deletes a completed text model through the core only after explicit confirmation and removes its transfer record', async () => {
  const f = fixture(),
    setups = f.make(),
    job = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
  await settle(setups, job.setup_id)
  await removeDownload(
    { setups } as never,
    { paths: f.tmp.paths, link: f.link } as never,
    { owner: 'setup', id: job.setup_id, installed: true },
    async () => ({ services: [], errors: [] })
  )
  expect(
    f.link.calls.some((call) => call.method === 'DELETE' && call.path.startsWith('/managed-models/'))
  ).toBe(true)
  expect(await setups.list()).toEqual([])
})
it('deletes a completed media model only explicitly and retains files shared by another quantization', async () => {
  const f = fixture(),
    root = f.tmp.paths.dataFolder,
    dir = join(f.tmp.paths.atcDir, 'media-installations')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'diffusion/models/image'), { recursive: true })
  const file = 'diffusion/models/image/weights',
    shared = 'diffusion/models/image/vae'
  for (const path of [file, shared]) await writeFile(join(root, path), 'weights')
  const job = (id: string, files: string[]) => ({
    id,
    stage: 'ready',
    plan: {
      category: 'image',
      engine: 'sd-cpp',
      model_id: id,
      files: files.map((save_path) => ({ save_path })),
    },
  })
  await writeFile(join(dir, 'first.json'), JSON.stringify(job('first', [file, shared])))
  await writeFile(join(dir, 'second.json'), JSON.stringify(job('second', [shared])))
  const service = new WorkspaceService({ paths: f.tmp.paths, link: f.link, config: defaultConfig() })
  await expect(service.execute('downloads.remove', { owner: 'artifacts', id: 'first' })).rejects.toThrow(
    'Installed models'
  )
  await service.execute('downloads.remove', { owner: 'artifacts', id: 'first', installed: true })
  await expect(stat(join(root, file))).rejects.toThrow()
  expect(await readFile(join(root, shared), 'utf8')).toBe('weights')
  expect(await service.execute('artifacts.list')).toMatchObject([{ id: 'second' }])
})

it('refuses a Foundry partial whose model folder points outside the data folder', async () => {
  const f = fixture(),
    external = fixture(),
    dir = join(f.tmp.paths.dataFolder, 'foundry-link')
  await mkdir(f.tmp.paths.dataFolder, { recursive: true })
  await mkdir(external.tmp.paths.dataFolder, { recursive: true })
  await symlink(external.tmp.paths.dataFolder, dir)
  await writeFile(join(external.tmp.paths.dataFolder, 'weights.tmp'), 'external')
  const job = { id: 'foundry-job', stage: 'cancelled', plan: { dir, files: [{ path: 'weights' }] } }
  const foundry = {
    remove: (_id: string, cleanup: (job: unknown) => Promise<void>) => cleanup(job),
    list: async () => [],
  }
  await expect(
    removeDownload(
      { foundry } as never,
      { paths: f.tmp.paths } as never,
      { owner: 'foundry', id: 'foundry-job' },
      async () => ({ services: [], errors: [] })
    )
  ).rejects.toThrow('outside')
  expect(await readFile(join(external.tmp.paths.dataFolder, 'weights.tmp'), 'utf8')).toBe('external')
})

it('protects a registered MLX model from removing a failed re-download', async () => {
  const f = fixture(),
    directory = join(f.tmp.paths.atcDir, 'media-installations')
  const file = 'mlx/models/owner/model/weights.safetensors'
  await mkdir(directory, { recursive: true })
  await mkdir(join(f.tmp.paths.dataFolder, 'mlx/models/owner/model'), { recursive: true })
  await writeFile(join(f.tmp.paths.dataFolder, file), 'installed')
  const registry = new ModelRegistry(f.tmp.paths.layout, 'mlx')
  await registry.write('owner/model', {
    model_path: join(f.tmp.paths.dataFolder, 'mlx/models/owner/model'),
    name: 'Model',
  })
  await writeFile(
    join(directory, 'retry.json'),
    JSON.stringify({
      id: 'retry',
      stage: 'failed',
      plan: { engine: 'mlx', category: 'text', model_id: 'owner/model', files: [{ save_path: file }] },
    })
  )
  const service = new WorkspaceService({ paths: f.tmp.paths, link: f.link, config: defaultConfig() })
  await expect(service.execute('downloads.remove', { owner: 'artifacts', id: 'retry' })).rejects.toThrow(
    'Installed models'
  )
  expect(await registry.find('owner/model')).not.toBeNull()
  expect(await readFile(join(f.tmp.paths.dataFolder, file), 'utf8')).toBe('installed')
})

it('keeps the completed download record when the core refuses to delete a loaded model', async () => {
  const f = fixture(),
    setups = f.make(),
    job = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
  await settle(setups, job.setup_id)
  const link = {
    request: async () => {
      throw new Error('Unload this model before deleting it.')
    },
  }
  await expect(
    removeDownload(
      { setups } as never,
      { paths: f.tmp.paths, link } as never,
      { owner: 'setup', id: job.setup_id, installed: true },
      async () => ({ services: [], errors: [] })
    )
  ).rejects.toThrow('Unload')
  expect((await setups.list())[0]?.stage).toBe('ready')
})
