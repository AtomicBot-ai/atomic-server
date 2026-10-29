import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fixture, install, settle } from '../../../test/helpers/model-setups-fixture.js'
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

it('reports a setup that fails after its download has completed', async () => {
  const f = fixture({ verdictAfter: 'throw' }),
    capture = vi.fn()
  const setups = f.make({ capture })
  const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
  expect((await settle(setups, started.setup_id)).stage).toBe('failed')
  expect(capture).toHaveBeenCalledTimes(1)
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      tags: expect.objectContaining({ component: 'model-setup', operation: 'setup.verifying' }),
    })
  )
})
