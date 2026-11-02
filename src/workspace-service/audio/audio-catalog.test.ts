import { afterEach, describe, expect, it, vi } from 'vitest'
import { catalogFixture } from '../../../test/helpers/model-catalog-fixture.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { WorkspaceCatalog } from '../models/catalog.js'
import { artifactPlan } from '../models/artifact-plan.js'
import { parseAudioCatalog } from './audio-catalog.js'
import baseline from './audio-catalog-baseline.json' with { type: 'json' }

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

function catalog(request: typeof fetch) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  return new WorkspaceCatalog(tmp.paths, request)
}
const conf = (body: unknown, status = 200) => vi.fn<typeof fetch>(async () => Response.json(body, { status }))

describe('the bundled audio catalog', () => {
  it('lists the four models the product offers, each with a pinned, checked download', () => {
    const { models } = parseAudioCatalog(baseline)
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

  it('names Stability AI on the one model whose license asks for it', () => {
    const named = parseAudioCatalog(baseline).models.filter((m) => m['attribution'])
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
  it('reads conf when conf has the list', async () => {
    const request = conf({
      schema_version: 1,
      models: [
        { id: 'new', name: 'New', description: 'd', mode: 'music', engines: ['audio-cpp'], quants: [{}] },
      ],
    })
    const { rows, cached } = await catalog(request).list('audio')
    expect(String(request.mock.calls[0]![0])).toMatch(/atomic-chat-conf\/main\/models\/audio\.json$/)
    expect(rows).toMatchObject([{ id: 'new', name: 'New', category: 'audio' }])
    expect(cached).toBe(false)
  })

  it('serves the bundled copy, with no error to show, while conf has none', async () => {
    const result = await catalog(conf({}, 404)).list('audio')
    expect(result.rows).toHaveLength(4)
    expect(result).toMatchObject({ cached: true })
    expect(result).not.toHaveProperty('error')
  })

  it('searches by name', async () => {
    const { rows } = await catalog(conf({}, 404)).list('audio', 'stable')
    expect(rows.map((r) => r.id)).toEqual(['stable-audio-3-small-sfx'])
  })

  it('keeps the list conf served last when conf goes away', async () => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const model = { id: 'kept', mode: 'music', engines: ['audio-cpp'], quants: [{}] }
    await new WorkspaceCatalog(tmp.paths, conf({ schema_version: 1, models: [model] })).list('audio')
    const later = new WorkspaceCatalog(tmp.paths, conf({}, 500))
    const { rows, error } = await later.list('audio', '', true)
    expect(rows.map((r) => r.id)).toEqual(['kept'])
    expect(error).toContain('500')
  })

  it('names another list by URL', async () => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const request = conf({ schema_version: 1, models: [] })
    await new WorkspaceCatalog(tmp.paths, request, undefined, 'https://example.test/audio.json').list('audio')
    expect(request).toHaveBeenCalledWith('https://example.test/audio.json', expect.anything())
  })
})

it('keeps the unified and audio catalog overrides independent through the workspace', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const modelUrl = 'https://example.test/models.json',
    audioUrl = 'https://example.test/audio.json'
  const request = vi.fn<typeof fetch>(async (input) => {
    if (String(input) === modelUrl)
      return Response.json(
        catalogFixture({
          'staff-picks': { picks: [{ model_name: 'owner/text', title: 'Text', format: 'gguf' }] },
        })
      )
    if (String(input) === audioUrl)
      return Response.json({
        schema_version: 1,
        models: [{ id: 'voice', mode: 'speech', engines: ['audio-cpp'], quants: [{}] }],
      })
    throw new Error(`Unexpected catalog URL: ${String(input)}`)
  })
  const workspace = new WorkspaceService({
    paths: tmp.paths,
    link: fakeCoreLink(),
    config: defaultConfig(),
    fetch: request,
    env: { ATC_MODEL_CATALOG_URL: modelUrl, ATC_AUDIO_MODELS_URL: audioUrl },
  })
  await expect(workspace.execute('models.catalog', { category: 'text' })).resolves.toMatchObject({
    rows: [{ id: 'owner/text' }],
    cached: false,
  })
  await expect(workspace.execute('models.catalog', { category: 'audio' })).resolves.toMatchObject({
    rows: [{ id: 'voice' }],
    cached: false,
  })
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([modelUrl, audioUrl])
})
