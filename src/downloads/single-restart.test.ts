import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as FsPromises from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { Downloader } from './downloader.js'

// Windows: a handle opened for appending has no write access for truncation, so `truncate` fails with
// EPERM there (it works on macOS and Linux). The file system here behaves the Windows way, so the
// restart-from-zero path is checked on every platform.
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof FsPromises>()
  const open: typeof fs.open = async (path, flags, mode) => {
    const handle = await fs.open(path, flags, mode)
    if (flags === 'a')
      handle.truncate = async () => {
        throw Object.assign(new Error('EPERM: operation not permitted, ftruncate'), { code: 'EPERM' })
      }
    return handle
  }
  return { ...fs, open, default: { ...fs, open } }
})

const server = new FixtureHttpServer()
const MiB = 1024 * 1024
const body = Buffer.alloc(3 * MiB)
for (let i = 0; i < body.length; i++) body[i] = (i * 11) % 251
const sha = createHash('sha256').update(body).digest('hex')

beforeAll(async () => {
  await server.start()
})
afterAll(async () => {
  server.release()
  await server.stop()
})
beforeEach(() => server.reset())

it('starts again from byte 0 when the server cannot resume mid-file, on Windows too', async () => {
  // The connection drops after 1 MiB; the resume request gets the whole file (no Range support).
  server.files.set('/model.bin', { body, ranges: false, dropAfterBytes: MiB, dropTimes: 1 })
  const dataFolder = await mkdtemp(join(tmpdir(), 'atc-restart-'))
  const dl = new Downloader({
    dataFolder,
    platform: 'win32',
    fetch,
    streams: 1,
    availableSpace: async () => undefined,
    sleep: async () => {},
  })
  await dl.download('t', [
    { url: server.url('/model.bin'), save_path: 'm/model.gguf', sha256: sha, size: body.length },
  ])
  expect((await readFile(join(dataFolder, 'm', 'model.gguf'))).equals(body)).toBe(true)
})
