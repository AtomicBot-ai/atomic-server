import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import { FREE_SPACE_HEADROOM } from './disk.js'
import { DOWNLOAD_CANCELLED, Downloader } from './downloader.js'
import type { DownloaderDeps } from './downloader.js'
import { defaultVerifyDeps, VALIDATION_CANCELLED_MESSAGE } from './verify.js'

const server = new FixtureHttpServer()
const MiB = 1024 * 1024
const body = Buffer.alloc(4 * MiB)
for (let i = 0; i < body.length; i++) body[i] = (i * 7) % 253
const sha = createHash('sha256').update(body).digest('hex')
const SAVE = 'llamacpp/models/m/model.gguf'

beforeAll(async () => {
  await server.start()
})
afterAll(async () => {
  server.release()
  await server.stop()
})
beforeEach(() => server.reset())

/** Four streams for any hash-pinned file of 1 MiB and more (production: 32 MiB). */
async function make(over: Partial<DownloaderDeps> = {}) {
  const dataFolder = await mkdtemp(join(tmpdir(), 'atc-ranges-'))
  const out = join(dataFolder, SAVE)
  let peak = 0
  const dl = new Downloader({
    dataFolder,
    platform: 'linux',
    fetch,
    streams: 4,
    minRangedBytes: MiB,
    availableSpace: async () => undefined,
    sleep: async () => {},
    onProgress: () => {
      void folderBytes(dirname(out)).then((n) => (peak = Math.max(peak, n)))
    },
    ...over,
  })
  return { dl, out, peak: () => peak }
}
async function folderBytes(dir: string): Promise<number> {
  const names = await readdir(dir).catch(() => [] as string[])
  const sizes = await Promise.all(names.map((n) => stat(join(dir, n)).then((s) => s.blocks * 512)))
  return sizes.reduce((a, b) => a + b, 0)
}
const item = (path: string) => ({ url: server.url(path), save_path: SAVE, sha256: sha, size: body.length })
const gets = () => server.requests.filter((r) => r.method === 'GET')

describe('Downloader, parallel byte ranges', () => {
  it('writes four ranges into one partial file and never holds more than the file on disk', async () => {
    server.files.set('/big.bin', { body })
    const { dl, out, peak } = await make()
    await dl.download('t', [item('/big.bin')])
    expect((await readFile(out)).equals(body)).toBe(true)
    expect(await readdir(dirname(out))).toEqual(['model.gguf'])
    expect(
      gets()
        .map((r) => r.range)
        .sort()
    ).toEqual([
      `bytes=0-${MiB - 1}`,
      `bytes=${MiB}-${2 * MiB - 1}`,
      `bytes=${2 * MiB}-${3 * MiB - 1}`,
      `bytes=${3 * MiB}-${4 * MiB - 1}`,
    ])
    // The partial plus its small sidecars: one copy of the file, never a second one beside it.
    expect(peak()).toBeLessThan(body.length + 64 * 1024)
  })

  it('succeeds when the volume holds the file and the headroom but not two files', async () => {
    server.files.set('/big.bin', { body })
    const { dl, out } = await make({ availableSpace: async () => body.length + FREE_SPACE_HEADROOM + 1 })
    await dl.download('t', [item('/big.bin')])
    expect((await readFile(out)).equals(body)).toBe(true)
  })

  it('retries a range whose connection drops, from the byte that range reached', async () => {
    server.files.set('/drop.bin', { body, dropAfterBytes: 100 * 1024, dropTimes: 1 })
    const { dl, out } = await make()
    await dl.download('t', [item('/drop.bin')])
    expect((await readFile(out)).equals(body)).toBe(true)
    expect(gets().map((r) => r.range)).toContain(`bytes=${100 * 1024}-${MiB - 1}`)
  })

  it('falls back to one stream when the server ignores Range', async () => {
    server.files.set('/plain.bin', { body, ranges: false })
    const { dl, out } = await make()
    await dl.download('t', [item('/plain.bin')])
    expect((await readFile(out)).equals(body)).toBe(true)
    expect(gets()).toHaveLength(1)
    expect(server.sent.get('/plain.bin')).toBe(body.length)
  })

  it('resumes cancelled ranges where each stopped, without fetching what is on disk again', async () => {
    server.files.set('/hold.bin', { body, holdAfterBytes: MiB / 2 })
    const { dl, out } = await make()
    const first = dl.download('t', [item('/hold.bin')])
    await waitFor(() => (server.sent.get('/hold.bin') ?? 0) === 2 * MiB)
    await waitFor(() => (dl.snapshot()[0]?.transferred ?? 0) === 2 * MiB)
    dl.cancel('t')
    await expect(first).rejects.toThrow(DOWNLOAD_CANCELLED)
    server.release()
    server.reset()
    server.files.set('/hold.bin', { body })
    await dl.download('t', [item('/hold.bin')], { resume: true })
    expect((await readFile(out)).equals(body)).toBe(true)
    expect(server.sent.get('/hold.bin')).toBe(2 * MiB)
    expect(await readdir(dirname(out))).toEqual(['model.gguf'])
  })

  it('leaves no stray files after a cancel during verification and a resume', async () => {
    server.files.set('/big.bin', { body })
    let hashing!: () => void
    const started = new Promise<void>((resolve) => (hashing = resolve))
    const verify = {
      ...defaultVerifyDeps,
      sha256: (path: string, signal?: AbortSignal) =>
        new Promise<string>((resolve, reject) => {
          hashing()
          signal?.addEventListener('abort', () => reject(new Error(VALIDATION_CANCELLED_MESSAGE)))
        }),
    }
    const blocked = await make({ verify })
    const first = blocked.dl.download('t', [item('/big.bin')])
    await started
    blocked.dl.cancel('t')
    await expect(first).rejects.toThrow(DOWNLOAD_CANCELLED)
    expect((await readdir(dirname(blocked.out))).sort()).toEqual([
      'model.gguf.ranges',
      'model.gguf.tmp',
      'model.gguf.url',
    ])
    const resumed = new Downloader({
      dataFolder: dirname(dirname(dirname(dirname(blocked.out)))),
      platform: 'linux',
      fetch,
      streams: 4,
      minRangedBytes: MiB,
      availableSpace: async () => undefined,
      sleep: async () => {},
    })
    const before = gets().length
    await resumed.download('t', [item('/big.bin')], { resume: true })
    expect(gets()).toHaveLength(before)
    expect((await readFile(blocked.out)).equals(body)).toBe(true)
    expect(await readdir(dirname(blocked.out))).toEqual(['model.gguf'])
  })
})
