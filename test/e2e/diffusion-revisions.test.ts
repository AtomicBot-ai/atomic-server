import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ATC } from '../helpers/binary.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { catalogFixture } from '../helpers/model-catalog-fixture.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('plans immutable diffusion URLs in the built program without downloading a model', async () => {
  const tmp = tmpDataFolder()
  const hub = new FixtureHttpServer()
  const base = await hub.start()
  const revision = 'a'.repeat(40)
  const env = { ...process.env, NO_COLOR: '1', HF_ENDPOINT: base }
  const run = (...args: string[]) =>
    new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(
        ATC[0]!,
        [...ATC.slice(1), ...args, '--data-folder', tmp.paths.dataFolder, '--json'],
        { env }
      )
      let out = '',
        err = ''
      child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
      child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
      child.once('error', reject)
      child.once('close', (code) => resolve({ code, out, err }))
    })
  mkdirSync(tmp.paths.cacheDir, { recursive: true })
  writeFileSync(
    join(tmp.paths.cacheDir, 'atomic-model-catalog-v1.json'),
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
            },
          ],
        },
      }),
    })
  )
  hub.files.set(
    `/api/models/unsloth/Z-Image-Turbo-GGUF/revision/${revision}?blobs=true&files_metadata=true`,
    {
      body: Buffer.from(JSON.stringify({ sha: revision, siblings: [{ rfilename: 'model.gguf', size: 10 }] })),
    }
  )
  try {
    const start = await run('start', '--admin-port', '0')
    expect(start.code, start.err).toBe(0)
    const plan = await run(
      'control',
      'call',
      'artifacts.plan',
      '--input',
      '{"category":"image","model_id":"z-image"}'
    )
    expect(plan.code, plan.err).toBe(0)
    expect(JSON.parse(plan.out).result.files[0].url).toBe(
      `https://huggingface.co/unsloth/Z-Image-Turbo-GGUF/resolve/${revision}/model.gguf`
    )
  } finally {
    await run('stop', '--force', '--kill')
    await hub.stop()
    tmp.cleanup()
  }
}, 60_000)
