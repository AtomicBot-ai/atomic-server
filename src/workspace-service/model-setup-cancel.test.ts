import type * as FsPromises from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fixture, install, settle } from '../../test/helpers/model-setups-fixture.js'

afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

/** Runs once, while the setup checks whether its file is already on disk (the `stat` before a download). */
const during = vi.hoisted(() => ({ stat: undefined as (() => void) | undefined }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof FsPromises>()
  const stat = (async (...args: Parameters<typeof fs.stat>) => {
    const result = fs.stat(...args) // usually ENOENT: the file is not there yet
    result.catch(() => undefined) // the caller sees the rejection; it is not unhandled while we wait
    if (String(args[0]).endsWith('.gguf') && during.stat) {
      const hook = during.stat
      during.stat = undefined
      hook()
      // The answer comes back only after the cancel has gone through, as it does when the disk is slow.
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return result
  }) as typeof fs.stat
  return { ...fs, stat, default: { ...fs, stat } }
})

// A cancel that lands while the setup looks for a finished file must still stop the download it is
// about to start; otherwise the transfer runs on and the cancel waits for it.
it('stops a download whose cancel arrived while the setup was checking the disk', async () => {
  const f = fixture()
  f.hub.hold = true // a transfer that is not stopped never finishes
  const setups = f.make()
  let cancelling: Promise<unknown> | undefined
  during.stat = () => {
    cancelling = setups.cancel(started.setup_id)
  }
  const started = await install(setups, 'owner/repo', 'model.Q4_K_M.gguf')
  await vi.waitFor(() => expect(cancelling).toBeDefined(), { timeout: 2000 })
  await cancelling
  expect(await settle(setups, started.setup_id)).toMatchObject({ stage: 'cancelled' })
  expect(f.downloader.snapshot()).toEqual([])
}, 10_000)
