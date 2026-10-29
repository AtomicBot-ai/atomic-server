import { afterEach, expect, it } from 'vitest'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

it.each([
  ['mlx', 'mlx'],
  [undefined, 'gguf'],
])('keeps curated display-name matches and searches the right format: %s', async (engine, format) => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const urls: URL[] = []
  const request = (async (input: unknown) => {
    const url = new URL(String(input))
    urls.push(url)
    return Response.json(
      url.hostname === 'raw.githubusercontent.com'
        ? {
            picks: [
              { model_name: 'owner/curated', title: 'LFM2 1.2B', format },
              {
                model_name: 'owner/other',
                title: 'LFM2 wrong format',
                format: format === 'mlx' ? 'gguf' : 'mlx',
              },
            ],
          }
        : [{ id: 'owner/remote', downloads: 123 }]
    )
  }) as typeof fetch
  const service = new WorkspaceService({
    paths: tmp.paths,
    link: fakeCoreLink(),
    config: defaultConfig(),
    fetch: request,
  })
  expect(
    await service.execute('models.search', { query: 'LFM2 1.2B', ...(engine ? { engine } : {}) })
  ).toMatchObject({
    rows: [{ id: 'owner/curated', name: 'LFM2 1.2B', source: { format } }, { id: 'owner/remote' }],
  })
  expect(
    urls.filter((u) => u.hostname === 'huggingface.co').every((u) => u.searchParams.get('filter') === format)
  ).toBe(true)
})

it('plans an MLX search result outside staff picks after checking its repository format', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const request = (async (input: unknown) => {
    const url = String(input)
    if (url.includes('raw.githubusercontent.com')) return Response.json({ picks: [] })
    if (url.includes('/tree/'))
      return Response.json([
        { type: 'file', path: 'config.json', size: 2 },
        { type: 'file', path: 'model.safetensors', size: 2 },
      ])
    return Response.json({ sha: 'a'.repeat(40), tags: url.includes('not-mlx') ? ['safetensors'] : ['mlx'] })
  }) as typeof fetch
  const service = new WorkspaceService({
    paths: tmp.paths,
    link: fakeCoreLink(),
    config: defaultConfig(),
    fetch: request,
  })
  await expect(
    service.execute('artifacts.plan', {
      category: 'text',
      model_id: 'owner/new-mlx',
    })
  ).resolves.toMatchObject({ engine: 'mlx', model_id: 'owner/new-mlx', files: expect.any(Array) })
  await expect(
    service.execute('artifacts.plan', {
      category: 'text',
      model_id: 'owner/not-mlx',
    })
  ).rejects.toThrow('MLX')
})
