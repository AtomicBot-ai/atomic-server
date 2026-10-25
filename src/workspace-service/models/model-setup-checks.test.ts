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

describe('ModelSetups checks and writers', () => {
  // The core's load gate refuses only on evidence (legacy, unsupported, another provider); a setup
  // removes only what it created, and keeps the bytes it fetched when the check itself failed.
  it('keeps a model installed before when a later check refuses it', async () => {
    const core = { verdictAfter: 'compatible' }
    const f = fixture(core)
    const setups = f.make()
    expect(
      await settle(setups, (await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')).setup_id)
    ).toMatchObject({
      stage: 'ready',
    })
    core.verdictAfter = 'unsupported'
    const again = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-2')
    expect(await settle(setups, again.setup_id)).toMatchObject({ stage: 'failed' })
    const dir = join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M')
    expect((await readFile(join(dir, 'model.Q4_K_M.gguf'))).equals(weights)).toBe(true)
    expect(await readFile(join(dir, 'model.yml'), 'utf8')).toContain('model_path')
  })

  it('takes back its own registration after a restart, when the core then refuses the file', async () => {
    const core = { verdictAfter: 'hang' }
    const f = fixture(core)
    const first = f.make()
    const started = await install(first, 'owner/repo', 'model.Q4_K_M.gguf')
    const dir = join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M')
    await waitFor(async () => (await first.get(started.setup_id)).stage === 'verifying')
    expect(await readFile(join(dir, 'model.yml'), 'utf8')).toContain('model_path')
    // The server stops here; the next one finds this setup interrupted while verifying.
    core.verdictAfter = 'unsupported'
    const restarted = f.make()
    await restarted.resume(started.setup_id)
    expect(await settle(restarted, started.setup_id)).toMatchObject({ stage: 'failed' })
    await expect(stat(dir)).rejects.toThrow()
  })

  it("forgets a registration it took back, so a later refusal leaves the next setup's model alone", async () => {
    const core = { verdictAfter: 'throw' }
    const f = fixture(core)
    const setups = f.make()
    const a = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-a')
    expect(await settle(setups, a.setup_id)).toMatchObject({ stage: 'failed' })
    core.verdictAfter = 'compatible'
    const b = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-b')
    expect(await settle(setups, b.setup_id)).toMatchObject({ stage: 'ready' })
    core.verdictAfter = 'unsupported'
    await setups.resume(a.setup_id)
    expect(await settle(setups, a.setup_id)).toMatchObject({ stage: 'failed' })
    const dir = join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M')
    expect(await readFile(join(dir, 'model.yml'), 'utf8')).toContain('model_path')
  })

  it('accepts a file the core has no evidence against, as its load gate does', async () => {
    const f = fixture({ verdictAfter: 'inspection_required' })
    const setups = f.make()
    const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    expect(outcome(await settle(setups, started.setup_id))).toEqual({ stage: 'ready', error: undefined })
  })

  it('unregisters but keeps the download when the check itself fails, then resumes without fetching again', async () => {
    const core = { verdictAfter: 'throw' }
    const f = fixture(core)
    const setups = f.make()
    const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
    expect(await settle(setups, started.setup_id)).toMatchObject({ stage: 'failed' })
    const dir = join(f.tmp.paths.layout.root, 'llamacpp/models/owner/model.Q4_K_M')
    await expect(stat(join(dir, 'model.yml'))).rejects.toThrow()
    expect((await readFile(join(dir, 'model.Q4_K_M.gguf'))).equals(weights)).toBe(true)
    core.verdictAfter = 'compatible'
    const fetched = f.hub.ranges.length
    await setups.resume(started.setup_id)
    expect(outcome(await settle(setups, started.setup_id))).toEqual({ stage: 'ready', error: undefined })
    expect(f.hub.ranges).toHaveLength(fetched)
  })

  it('refuses to resume while another setup writes the same model, and names it', async () => {
    const f = fixture()
    f.hub.hold = true
    const setups = f.make()
    const stopped = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-1')
    await waitFor(() => (f.downloader.snapshot()[0]?.transferred ?? 0) === weights.length / 2)
    await setups.cancel(stopped.setup_id)
    await settle(setups, stopped.setup_id, ['cancelled'])
    const running = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf', 'req-2')
    expect(running.setup_id).not.toBe(stopped.setup_id)
    // Said, not hidden: the stopped setup stays stopped and the message names the one writing the file.
    await expect(setups.resume(stopped.setup_id)).rejects.toThrow(running.setup_id)
    expect((await setups.get(stopped.setup_id)).stage).toBe('cancelled')
    await setups.cancel(running.setup_id)
  })
})
