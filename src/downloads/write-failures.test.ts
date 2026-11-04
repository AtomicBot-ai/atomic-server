import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type * as FsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadRanged } from './ranges.js'
import type { FileJob } from './request.js'
import { downloadSingle } from './single.js'

// Model a large existing partial without allocating gigabytes. Only the next payload write fails;
// real sidecar I/O and the production resume/range paths still run.
const fault = vi.hoisted(() => ({ offset: 0, code: '', writes: [] as number[] }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof FsPromises>()
  return {
    ...fs,
    stat: async (path: string) => {
      const value = await fs.stat(path)
      if (path.endsWith('.tmp')) value.size = fault.offset
      return value
    },
    open: async (...args: Parameters<typeof fs.open>) => {
      const handle = await fs.open(...args)
      handle.write = async (...args: unknown[]) => {
        fault.writes.push(Number(args[3]))
        throw Object.assign(new Error(fault.code), { code: fault.code })
      }
      return handle
    },
  }
})

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe.each(['single', 'ranged'] as const)('%s download write failures', (mode) => {
  it.each([
    ['ENOSPC', 'disk_full'],
    ['EDQUOT', 'disk_full'],
    ['EINVAL', 'disk_io'],
    ['EFBIG', 'disk_fs_limit'],
  ])('preserves %s across and beyond 4 GiB', async (code, tag) => {
    for (const offset of [2 ** 32 - 11, 6 * 2 ** 30]) {
      fault.offset = offset
      fault.code = code
      fault.writes = []
      const dir = await mkdtemp(join(tmpdir(), 'atc-write-failure-'))
      dirs.push(dir)
      const savePath = join(dir, 'model.gguf')
      const size = offset + 64
      const url = 'https://fixture.invalid/model.gguf'
      await writeFile(`${savePath}.tmp`, '')
      await writeFile(`${savePath}.url`, url)
      const fetcher = vi.fn<typeof fetch>(
        async () =>
          new Response(new Uint8Array(64), {
            status: 206,
            headers: { 'Content-Range': `bytes ${offset}-${size - 1}/${size}` },
          })
      )
      const job: FileJob = {
        savePath,
        identity: url,
        url,
        size,
        resume: true,
        fetch: fetcher,
        headers: {},
        signal: new AbortController().signal,
        sleep: async () => {},
        retryBaseMs: 0,
        log: () => {},
        report: () => {},
      }
      const run = mode === 'single' ? downloadSingle(job) : downloadRanged(job, 1)
      await expect(run).rejects.toMatchObject({
        message: expect.stringContaining(`Error: [${tag}] ${code}`),
        cause: expect.objectContaining({ code }),
      })
      expect(fault.writes).toEqual([offset])
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })
})
