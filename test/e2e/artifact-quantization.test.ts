import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runAtcAsync } from '../helpers/async-binary.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'
import { reportCollector } from '../helpers/report-collector.js'

it('refuses unknown media quantizations locally but reports a broken catalog in the built program', async () => {
  const tmp = tmpDataFolder(),
    collector = await reportCollector()
  const env = {
    ...process.env,
    ATC_SENTRY_DSN: collector.dsn,
    ATC_SENTRY_ENVIRONMENT: 'e2e',
    DO_NOT_TRACK: '0',
    ATOMIC_CORE_TELEMETRY: '1',
  }
  const run = (...args: string[]) =>
    runAtcAsync([...args, '--data-folder', tmp.paths.dataFolder, '--json'], { env })
  const call = (model_id: string, category = 'image', quant = 'unavailable') =>
    run('control', 'call', 'artifacts.plan', '--input', JSON.stringify({ category, model_id, quant }))
  mkdirSync(tmp.paths.cacheDir, { recursive: true })
  writeFileSync(
    join(tmp.paths.cacheDir, 'workspace-diffusion.json'),
    JSON.stringify({
      at: Date.now(),
      data: {
        families: ['image', 'video', 'empty'].map((id) => ({
          id,
          modality: id === 'video' ? 'video' : 'image',
          transformer: {
            repo: 'owner/model',
            quants: id === 'empty' ? [] : [{ id: 'q4', filename: 'model.gguf', bytes: 10 }],
          },
        })),
      },
    })
  )
  try {
    const started = await run('start', '--admin-port', '0')
    expect(started.code, started.err).toBe(0)
    for (const category of ['image', 'video']) {
      const result = await call(category, category)
      expect(result.code, result.err).toBe(2)
      expect(JSON.parse(result.err)).toMatchObject({
        error: { code: 'ATC_USAGE', message: 'Choose an available quantization.' },
      })
      expect(result.out).toBe('')
    }
    expect(existsSync(join(tmp.paths.atcDir, 'media-installations'))).toBe(false)
    expect(collector.events).toHaveLength(0)
    const broken = await call('empty')
    expect(broken.code, broken.err).toBe(1)
    expect(JSON.parse(broken.err)).toMatchObject({
      error: { code: 'ATC_INTERNAL', message: 'This catalog family has no downloadable quantization.' },
    })
    await expect.poll(() => collector.events.length).toBe(1)
    expect(collector.events[0]).toContain('"operation":"artifacts.plan"')
    const valid = await call('image', 'image', 'q4')
    expect(valid.code, valid.err).toBe(0)
    expect(JSON.parse(valid.out).result).toMatchObject({ model_id: 'image:q4' })
    expect(collector.events).toHaveLength(1)
  } finally {
    await run('stop', '--force', '--kill')
    await collector.close()
    tmp.cleanup()
  }
})
