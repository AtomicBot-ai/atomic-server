import type * as FsPromises from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { flmFixture } from '../helpers/fastflowlm.js'
const refused = vi.hoisted(() => ({ count: 0 }))
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof FsPromises>()
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      if (from.includes('transfers') && from.endsWith('qwen3-0.6b-npu2') && refused.count++ < 2)
        throw Object.assign(new Error('Windows scanner holds the candidate directory.'), { code: 'EPERM' })
      return fs.rename(from, to)
    },
  }
})
let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())
it('publishes verified bytes after transient Windows directory locks without failing the job', async () => {
  const f = await flmFixture()
  cleanup = f.cleanup
  const p = (await f.service.execute('fastflowlm.plan', { model: f.definition.model_id })) as {
    digest: string
  }
  await f.service.execute('fastflowlm.install', { request_id: 'windows-lock', plan_digest: p.digest })
  await vi.waitFor(
    async () => {
      const job = (await f.service.snapshot()).setups.find((v) => (v as { id: string }).id === 'windows-lock')
      expect(job).toMatchObject({ stage: 'ready' })
    },
    { timeout: 3000 }
  )
  expect(refused.count).toBe(3)
})
