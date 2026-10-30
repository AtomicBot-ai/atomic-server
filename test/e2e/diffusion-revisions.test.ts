import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runAtc } from '../helpers/binary.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it('plans immutable diffusion URLs in the built program without downloading a model', () => {
  const tmp = tmpDataFolder()
  const revision = 'a'.repeat(40)
  const run = (...args: string[]) => runAtc([...args, '--data-folder', tmp.paths.dataFolder, '--json'])
  mkdirSync(tmp.paths.cacheDir, { recursive: true })
  writeFileSync(
    join(tmp.paths.cacheDir, 'workspace-diffusion.json'),
    JSON.stringify({
      at: Date.now(),
      data: {
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
    })
  )
  try {
    const start = run('start', '--admin-port', '0')
    expect(start.code, start.err).toBe(0)
    const plan = run(
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
    run('stop', '--force', '--kill')
    tmp.cleanup()
  }
})
