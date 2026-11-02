import { catalogFixture, MODEL_COMMIT } from '../helpers/model-catalog-fixture.js'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { atcPathsFor, defaultConfig } from '../../src/config/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import { testRun } from '../helpers/test-context.js'
import { workspaceServer } from '../helpers/workspace-server.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()))

function context(category: 'image' | 'video', quants: unknown) {
  const t = testRun()
  cleanup.push(t.cleanup)
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER']!)
  mkdirSync(paths.cacheDir, { recursive: true })
  writeFileSync(
    join(paths.cacheDir, 'atomic-model-catalog-v1.json'),
    JSON.stringify({
      at: Date.now(),
      catalog: catalogFixture({
        diffusion: {
          families: [{ id: 'fixture', modality: category, transformer: { repo: 'owner/model', quants } }],
        },
      }),
    })
  )
  const capture = vi.fn(),
    request = vi.fn<typeof fetch>(async (url) => {
      if (!String(url).includes(`/api/models/owner/model/revision/${MODEL_COMMIT}`))
        throw new Error('Unexpected metadata request.')
      return Response.json({ sha: MODEL_COMMIT, siblings: [{ rfilename: 'model.gguf', size: 10 }] })
    }),
    service = new WorkspaceService({
      paths,
      link: t.link,
      config: defaultConfig(),
      fetch: request,
      errors: { capture },
    })
  return { t, paths, service, capture, request }
}

it.each(['image', 'video'] as const)(
  'keeps an unavailable %s quantization out of reports and returns usage through the command',
  async (category) => {
    const { t, paths, service, capture, request } = context(category, [
      { id: 'q4', filename: 'model.gguf', bytes: 10 },
    ])
    const input = { category, model_id: 'fixture', quant: 'unavailable' }
    await expect(service.execute('artifacts.plan', input)).rejects.toMatchObject({ code: 'ATC_USAGE' })
    expect(capture).not.toHaveBeenCalled()
    expect(existsSync(join(paths.atcDir, 'media-installations'))).toBe(false)
    const server = await workspaceServer(t.link, paths)
    try {
      expect(
        await t.run(['control', 'call', 'artifacts.plan', '--input', JSON.stringify(input), '--json'])
      ).toBe(2)
      expect(JSON.parse(t.io.err.join(''))).toMatchObject({
        error: { code: 'ATC_USAGE', message: 'Choose an available quantization.' },
      })
      expect(request).not.toHaveBeenCalled()
      await expect(service.execute('artifacts.plan', { ...input, quant: 'q4' })).resolves.toMatchObject({
        model_id: 'fixture:q4',
      })
      expect(capture).not.toHaveBeenCalled()
      expect(request).toHaveBeenCalledOnce()
      expect(t.link.calls).toEqual([])
    } finally {
      await server.close()
    }
  }
)

it.each([[], undefined, null, {}].map((quants) => ({ quants })))(
  'still reports a catalog with invalid quants $quants',
  async ({ quants }) => {
    const { paths, service, capture, request } = context('image', quants)
    await expect(
      service.execute('artifacts.plan', { category: 'image', model_id: 'fixture', quant: 'unavailable' })
    ).rejects.toMatchObject({ message: 'This catalog family has no downloadable quantization.' })
    expect(capture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        tags: expect.objectContaining({ component: 'workspace', operation: 'artifacts.plan' }),
      })
    )
    expect(existsSync(join(paths.atcDir, 'media-installations'))).toBe(false)
    expect(request).not.toHaveBeenCalled()
  }
)
