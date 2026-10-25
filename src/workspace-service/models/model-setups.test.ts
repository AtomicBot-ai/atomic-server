import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanup,
  fixture,
  install,
  outcome,
  settle,
  weights,
} from '../../../test/helpers/model-setups-fixture.js'
import { waitFor } from '../../../test/helpers/wait-for.js'

afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

describe('ModelSetups', () => {
  it('downloads a stock GGUF itself, registers it and checks it by model_id', async () => {
    const f = fixture()
    const setups = f.make()
    const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    const done = await settle(setups, started.setup_id)
    expect(done).toMatchObject({
      stage: 'ready',
      plan: { model_id: 'owner/model.Q4_K_M', provider: 'llamacpp-upstream' },
    })
    const dir = join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M')
    expect((await readFile(join(dir, 'model.Q4_K_M.gguf'))).equals(weights)).toBe(true)
    expect(await readFile(join(dir, 'model.yml'), 'utf8')).toContain('model_sha256')
    expect(f.link.calls).toContainEqual(
      expect.objectContaining({
        path: '/models/compatibility',
        body: { model_id: 'owner/model.Q4_K_M', provider: 'llamacpp-upstream' },
      })
    )
    expect(f.link.calls.some((c) => c.path.includes('model-setups') || c.path.includes('setup-plan'))).toBe(
      false
    )
    expect(JSON.stringify(await setups.list())).not.toContain('hf_secret')
    expect(await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')).toMatchObject({
      setup_id: started.setup_id,
    })
  })

  it('installs and activates the PrismML build through the core before downloading Bonsai and its projector', async () => {
    const f = fixture({ prism: true })
    const setups = f.make()
    const started = await install(setups, 'prism-ml/Bonsai-gguf', 'Bonsai-Q1_0.gguf')
    expect(started.task_ids).toMatchObject({ engine: expect.any(String), projector: expect.any(String) })
    expect(outcome(await settle(setups, started.setup_id))).toEqual({ stage: 'ready', error: undefined })
    const order = f.link.calls.map((c) => c.path)
    expect(order.indexOf('/backends/atomic-prism/install')).toBeLessThan(
      order.indexOf('/engines/atomic-prism/builds/prism-b3-abcdef0/cpu/activate')
    )
    const yml = await readFile(
      join(f.tmp.paths.layout.root, 'llamacpp/models/prism-ml/Bonsai-Q1_0/model.yml'),
      'utf8'
    )
    expect(yml).toContain('atomic_runtime')
    expect(yml).toContain('mmproj_path')
  })

  it('fails and removes a downloaded file whose header the core does not accept', async () => {
    const f = fixture({ verdictAfter: 'unsupported' })
    const setups = f.make()
    const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    expect(await settle(setups, started.setup_id)).toMatchObject({
      stage: 'failed',
      error: { message: 'The file needs another engine.' },
    })
    await expect(stat(join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M'))).rejects.toThrow()
  })

  it('cancels mid-file and resumes from the bytes on disk', async () => {
    const f = fixture()
    f.hub.hold = true
    const setups = f.make()
    const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    await waitFor(() => (f.downloader.snapshot()[0]?.transferred ?? 0) === weights.length / 2)
    expect((await setups.cancel(started.setup_id)).stage).toBe('cancelled')
    f.hub.hold = false
    await setups.resume(started.setup_id)
    expect(outcome(await settle(setups, started.setup_id))).toEqual({ stage: 'ready', error: undefined })
    expect(f.hub.ranges).toEqual([`bytes=${weights.length / 2}-`])
  })

  it('shows a setup a stopped server left as interrupted and continues it after the restart', async () => {
    const f = fixture()
    f.hub.hold = true
    const first = f.make()
    const started = await install(first, 'owner/repo', 'model.Q4_K_M.gguf')
    await waitFor(() => (f.downloader.snapshot()[0]?.transferred ?? 0) === weights.length / 2)
    f.downloader.cancel(started.task_ids.model)
    await settle(first, started.setup_id, ['cancelled', 'failed'])
    // The record a crashed server leaves behind: mid-download, nobody running it.
    const record = join(f.tmp.paths.atcDir, 'model-setups', `${started.setup_id}.json`)
    const raw = JSON.parse(await readFile(record, 'utf8'))
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(record, JSON.stringify({ ...raw, stage: 'downloading_model' }))
    )
    f.hub.hold = false
    const restarted = f.make()
    expect((await restarted.list())[0]).toMatchObject({
      stage: 'interrupted',
      stopped_at: 'downloading_model',
    })
    await restarted.resume(started.setup_id)
    expect(await settle(restarted, started.setup_id)).toMatchObject({ stage: 'ready' })
    expect(f.hub.ranges).toEqual([`bytes=${weights.length / 2}-`])
  })

  it('returns the running setup of the same model instead of starting a second writer', async () => {
    const f = fixture()
    f.hub.hold = true
    const setups = f.make()
    const first = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-1')
    const second = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-2')
    expect(second.setup_id).toBe(first.setup_id)
    expect(await setups.list()).toHaveLength(1)
    await setups.cancel(first.setup_id)
  })

  it('refuses an install whose plan was not reviewed here', async () => {
    const f = fixture()
    await expect(
      f.make().install({
        request: { repo: 'owner/repo', file: 'model.Q4_K_M.gguf' },
        plan_digest: 'unknown',
        request_id: 'r',
      })
    ).rejects.toThrow('models.plan')
  })
})
