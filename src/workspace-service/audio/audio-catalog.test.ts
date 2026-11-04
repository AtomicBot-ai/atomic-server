import { afterEach, describe, expect, it, vi } from 'vitest'
import { ATOMIC_MODEL_CATALOG_URL, projectAtomicModelCollection } from '@atomic-chat/core/client'
import { catalogFixture } from '../../../test/helpers/model-catalog-fixture.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { WorkspaceCatalog } from '../models/catalog.js'
import { artifactPlan } from '../models/artifact-plan.js'
import { unifiedCatalogBaseline } from '../models/unified-catalog.js'
import { parseAudioCatalog } from './audio-catalog.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

function catalog(request: typeof fetch) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  return new WorkspaceCatalog(tmp.paths, request)
}
const conf = (body: unknown, status = 200) => vi.fn<typeof fetch>(async () => Response.json(body, { status }))
const bundled = () => parseAudioCatalog(projectAtomicModelCollection(unifiedCatalogBaseline(), 'audio'))
const audioCatalog = (...models: Array<Record<string, unknown>>) => catalogFixture({ audio: { models } })

describe('the bundled audio collection', () => {
  it('lists the four models the product offers, each with a pinned, checked download', () => {
    const { models } = bundled()
    expect(models.map((m) => m['id'])).toEqual([
      'qwen3-tts-1.7b-customvoice',
      'moss-tts-nano-100m',
      'ace-step-1.5-turbo',
      'stable-audio-3-small-sfx',
    ])
    for (const source of models) {
      const row = {
        id: String(source['id']),
        name: String(source['name']),
        category: 'audio' as const,
        description: '',
        source,
      }
      const [file] = artifactPlan(row, '/data').files
      expect(file).toMatchObject({
        url: expect.stringContaining('/resolve/874fcb41ececda20bcbc0782d6b4ea7f7d069ea8/'),
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        size: expect.any(Number),
      })
    }
  })

  it("names each model's maker for its logo", () => {
    expect(bundled().models.map((m) => m['icon'])).toEqual(['qwen', 'openmoss', 'acestep', 'stability'])
  })

  it('names Stability AI on the one model whose license asks for it', () => {
    const named = bundled().models.filter((m) => m['attribution'])
    expect(named.map((m) => [m['id'], m['attribution']])).toEqual([
      ['stable-audio-3-small-sfx', 'Powered by Stability AI'],
    ])
  })
})

describe('parseAudioCatalog', () => {
  it('refuses a newer schema whole', () => {
    expect(() => parseAudioCatalog({ schema_version: 2, models: [] })).toThrow('unsupported schema')
  })

  it('skips what this client cannot run', () => {
    const model = { id: 'a', mode: 'speech', engines: ['audio-cpp'], quants: [{}] }
    const { models } = parseAudioCatalog({
      schema_version: 1,
      models: [
        model,
        { ...model, id: 'mode', mode: 'singing' },
        { ...model, id: 'engine', engines: ['other'] },
        { ...model, id: 'files', quants: [] },
        { ...model, id: 'off', active: false },
      ],
    })
    expect(models.map((m) => m['id'])).toEqual(['a'])
  })
})

describe('the audio category of the catalog', () => {
  const music = {
    id: 'new',
    name: 'New',
    description: 'd',
    mode: 'music',
    engines: ['audio-cpp'],
    quants: [{}],
  }

  it("reads the unified catalog's audio collection", async () => {
    const request = conf(audioCatalog(music, { ...music, id: 'other-engine', engines: ['other'] }))
    const { rows, cached } = await catalog(request).list('audio')
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([ATOMIC_MODEL_CATALOG_URL])
    expect(rows).toMatchObject([{ id: 'new', name: 'New', description: 'd', category: 'audio' }])
    expect(cached).toBe(false)
  })

  it('serves the bundled collection while conf cannot be reached', async () => {
    const result = await catalog(conf({}, 404)).list('audio')
    expect(result.rows).toHaveLength(4)
    expect(result).toMatchObject({ cached: true, error: expect.stringContaining('404') })
  })

  it('searches by name', async () => {
    const { rows } = await catalog(conf({}, 404)).list('audio', 'stable')
    expect(rows.map((r) => r.id)).toEqual(['stable-audio-3-small-sfx'])
  })

  it('keeps the catalog conf served last when conf goes away', async () => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    await new WorkspaceCatalog(tmp.paths, conf(audioCatalog({ ...music, id: 'kept' }))).list('audio')
    const later = new WorkspaceCatalog(tmp.paths, conf({}, 500))
    const { rows, error } = await later.list('audio', '', true)
    expect(rows.map((r) => r.id)).toEqual(['kept'])
    expect(error).toContain('500')
  })
})

it('follows ATC_MODEL_CATALOG_URL like every other category, with one fetch for both', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const modelUrl = 'https://example.test/models.json'
  const request = vi.fn<typeof fetch>(async (input) => {
    if (String(input) === modelUrl)
      return Response.json(
        catalogFixture({
          'staff-picks': { picks: [{ model_name: 'owner/text', title: 'Text', format: 'gguf' }] },
          'audio': { models: [{ id: 'voice', mode: 'speech', engines: ['audio-cpp'], quants: [{}] }] },
        })
      )
    throw new Error(`Unexpected catalog URL: ${String(input)}`)
  })
  const workspace = new WorkspaceService({
    paths: tmp.paths,
    link: fakeCoreLink(),
    config: defaultConfig(),
    fetch: request,
    env: { ATC_MODEL_CATALOG_URL: modelUrl },
  })
  await expect(workspace.execute('models.catalog', { category: 'text' })).resolves.toMatchObject({
    rows: [{ id: 'owner/text' }],
    cached: false,
  })
  await expect(workspace.execute('models.catalog', { category: 'audio' })).resolves.toMatchObject({
    rows: [{ id: 'voice' }],
  })
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([modelUrl])
})
