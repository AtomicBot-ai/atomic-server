import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { catalogFixture } from '../helpers/model-catalog-fixture.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import { testRun } from '../helpers/test-context.js'
import { workspaceServer } from '../helpers/workspace-server.js'

it('exposes pinned diffusion URLs through the command and workspace contract', async () => {
  const t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER']!)
  const revision = 'a'.repeat(40)
  const vaeRevision = 'b'.repeat(40)
  mkdirSync(paths.cacheDir, { recursive: true })
  writeFileSync(
    join(paths.cacheDir, 'atomic-model-catalog-v1.json'),
    JSON.stringify({
      at: Date.now(),
      catalog: catalogFixture({
        diffusion: {
          families: [
            {
              id: 'z-image',
              name: 'Z-Image Turbo',
              modality: 'image',
              transformer: {
                repo: 'unsloth/Z-Image-Turbo-GGUF',
                revision,
                quants: [{ id: 'q4', filename: 'model.gguf', bytes: 10 }],
              },
              vae: { repo: 'owner/vae', revision: vaeRevision, filename: 'vae.safetensors', bytes: 20 },
            },
          ],
        },
      }),
    })
  )
  const hub = new FixtureHttpServer()
  const base = await hub.start()
  hub.files.set(
    `/api/models/unsloth/Z-Image-Turbo-GGUF/revision/${revision}?blobs=true&files_metadata=true`,
    {
      body: Buffer.from(JSON.stringify({ sha: revision, siblings: [{ rfilename: 'model.gguf', size: 10 }] })),
    }
  )
  hub.files.set(`/api/models/owner/vae/revision/${vaeRevision}?blobs=true&files_metadata=true`, {
    body: Buffer.from(
      JSON.stringify({ sha: vaeRevision, siblings: [{ rfilename: 'vae.safetensors', size: 20 }] })
    ),
  })
  const server = await workspaceServer(t.link, paths, {}, base)
  try {
    expect(
      await t.run([
        'control',
        'call',
        'artifacts.plan',
        '--input',
        '{"category":"image","model_id":"z-image"}',
        '--json',
      ])
    ).toBe(0)
    const result = JSON.parse(t.io.out.join('')).result
    expect(result.files.map((file: { url: string }) => file.url)).toEqual([
      `https://huggingface.co/unsloth/Z-Image-Turbo-GGUF/resolve/${revision}/model.gguf`,
      `https://huggingface.co/owner/vae/resolve/${vaeRevision}/vae.safetensors`,
    ])
  } finally {
    await server.close()
    await hub.stop()
    t.cleanup()
  }
})
