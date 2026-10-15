import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { waitFor } from '../../test/helpers/wait-for.js'
import { DOWNLOAD_CANCELLED, Downloader } from './downloader.js'
import type { DownloaderDeps, DownloadProgress } from './downloader.js'
import { HASH_MISMATCH_MESSAGE } from './verify.js'

const server = new FixtureHttpServer()
const body = Buffer.alloc(3 * 1024 * 1024)
for (let i = 0; i < body.length; i++) body[i] = i % 251
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

/** One stream unless a test asks for ranges: these cases are about the single-stream path. */
async function make(over: Partial<DownloaderDeps> = {}) {
  const dataFolder = await mkdtemp(join(tmpdir(), 'atc-dl-'))
  const progress: DownloadProgress[] = []
  const dl = new Downloader({
    dataFolder,
    platform: 'linux',
    fetch,
    streams: 1,
    availableSpace: async () => undefined,
    sleep: async () => {},
    onProgress: (p) => progress.push(p),
    ...over,
  })
  return { dl, dataFolder, progress, out: join(dataFolder, SAVE) }
}
const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false
  )
const item = (path: string, extra: Record<string, unknown> = {}) => ({
  url: server.url(path),
  save_path: SAVE,
  sha256: sha,
  size: body.length,
  ...extra,
})

describe('Downloader, one stream', () => {
  it('downloads, verifies and removes its sidecars, reporting progress and an empty snapshot after', async () => {
    server.files.set('/ok.bin', { body })
    const { dl, out, progress } = await make()
    await dl.download('t1', [item('/ok.bin')])
    expect((await readFile(out)).equals(body)).toBe(true)
    expect(await readdir(dirname(out))).toEqual(['model.gguf'])
    expect(progress.at(-1)).toEqual({
      taskId: 't1',
      transferred: body.length,
      total: body.length,
      percent: 100,
    })
    expect(dl.snapshot()).toEqual([])
  })

  it('continues after the connection drops mid-file, from the byte it reached', async () => {
    server.files.set('/drop.bin', { body, dropAfterBytes: 1024 * 1024, dropTimes: 2 })
    const { dl, out } = await make()
    await dl.download('t', [item('/drop.bin')])
    expect((await readFile(out)).equals(body)).toBe(true)
    const ranged = server.requests.filter((r) => r.method === 'GET' && r.range)
    expect(ranged[0]?.range).toBe(`bytes=${1024 * 1024}-`)
    expect(server.sent.get('/drop.bin')).toBe(body.length)
  })

  it('resumes a cancelled download from its partial file instead of starting again', async () => {
    server.files.set('/hold.bin', { body, holdAfterBytes: 2 * 1024 * 1024 })
    const { dl, out } = await make()
    const first = dl.download('t', [item('/hold.bin')])
    await waitFor(async () => (await stat(`${out}.tmp`).catch(() => null))?.size === 2 * 1024 * 1024)
    expect(dl.snapshot()).toEqual([expect.objectContaining({ taskId: 't', total: body.length })])
    expect(dl.cancel('t')).toBe(true)
    await expect(first).rejects.toThrow(DOWNLOAD_CANCELLED)
    server.release()
    server.files.set('/hold.bin', { body })
    await dl.download('t', [item('/hold.bin')], { resume: true })
    expect((await readFile(out)).equals(body)).toBe(true)
    expect(server.requests.at(-1)?.range).toBe(`bytes=${2 * 1024 * 1024}-`)
  })

  it('removes the file and its sidecars when the hash does not match', async () => {
    server.files.set('/bad.bin', { body })
    const { dl, out } = await make()
    await expect(dl.download('t', [item('/bad.bin', { sha256: 'f'.repeat(64) })])).rejects.toThrow(
      HASH_MISMATCH_MESSAGE
    )
    expect(await exists(out)).toBe(false)
    expect(await exists(dirname(out))).toBe(false)
  })

  it('refuses before the first byte when the volume cannot hold the file and its headroom', async () => {
    server.files.set('/ok.bin', { body })
    const { dl } = await make({ availableSpace: async () => body.length })
    await expect(dl.download('t', [item('/ok.bin')])).rejects.toThrow('[disk_full]')
    expect(server.requests.filter((r) => r.method === 'GET')).toEqual([])
  })

  it('refuses a path over the Windows limit and a path outside the data folder', async () => {
    server.files.set('/ok.bin', { body })
    const win = await make({ platform: 'win32' })
    await expect(
      win.dl.download('t', [item('/ok.bin', { save_path: `models/${'x'.repeat(300)}.gguf` })])
    ).rejects.toThrow('[disk_path_too_long]')
    const { dl } = await make()
    await expect(dl.download('t', [item('/ok.bin', { save_path: '../escape.gguf' })])).rejects.toThrow(
      'outside of the data folder'
    )
  })

  it('starts again when the partial belongs to another URL', async () => {
    server.files.set('/ok.bin', { body })
    const { dl, out } = await make()
    await mkdir(dirname(out), { recursive: true })
    await writeFile(`${out}.tmp`, Buffer.alloc(1024, 7))
    await writeFile(`${out}.url`, 'https://elsewhere.example/model.gguf')
    await dl.download('t', [item('/ok.bin')], { resume: true })
    expect((await readFile(out)).equals(body)).toBe(true)
    expect(server.requests.filter((r) => r.range)).toEqual([])
  })

  it('stops the other files of a task when one fails, so none keeps writing after it', async () => {
    server.files.set('/ok.bin', { body, holdAfterBytes: 1024 })
    const { dl, dataFolder } = await make()
    const other = { ...item('/ok.bin'), save_path: 'llamacpp/models/m/other.gguf' }
    await expect(
      dl.download('t', [other, { url: server.url('/missing.bin'), save_path: SAVE, size: 10 }])
    ).rejects.toThrow('404')
    const size = () =>
      stat(join(dataFolder, 'llamacpp/models/m/other.gguf.tmp')).then(
        (st) => st.size,
        () => 0
      )
    const atEnd = await size()
    server.release()
    await new Promise((r) => setTimeout(r, 50))
    expect(atEnd).toBeLessThanOrEqual(1024)
    expect(await size()).toBe(atEnd)
    expect(dl.active()).toEqual([])
  })
})
