/**
 * The file operations an update needs, on the real file system. The download is read chunk by chunk
 * from the response's own reader and hashed as it goes — never through `Readable.fromWeb` and
 * `pipeline`, which the Bun 1.3 binary can leave waiting forever in the middle of a body (fixed in
 * Bun 1.4.0, oven-sh/bun#34559); on windows-2022 that stall held `atc update` open until the e2e
 * test's timeout. A stream that sends nothing for `DOWNLOAD_STALL_MS` is given up, so no transport
 * fault can hang the command.
 */

import { createHash } from 'node:crypto'
import { chmod, open, readdir, rename, rm } from 'node:fs/promises'
import { AtcError } from '../errors/index.js'
import type { UpdateFiles } from './apply.js'

/** No bytes for this long and the download is given up. */
export const DOWNLOAD_STALL_MS = 30_000

export interface NodeUpdateFilesOptions {
  stallMs?: number
}

export function nodeUpdateFiles(fetchImpl: typeof fetch, options: NodeUpdateFilesOptions = {}): UpdateFiles {
  const stallMs = options.stallMs ?? DOWNLOAD_STALL_MS
  return {
    download: (url, path) => download(fetchImpl, url, path, stallMs),
    rename: (from, to) => rename(from, to),
    chmod: (path, mode) => chmod(path, mode),
    remove: (path) => rm(path, { force: true }),
    list: (dir) => readdir(dir),
  }
}

/** Write the body of `url` to `path`; the SHA-256 of what was written. The caller removes a failed file. */
async function download(
  fetchImpl: typeof fetch,
  url: string,
  path: string,
  stallMs: number
): Promise<string> {
  const aborter = new AbortController()
  const res = await fetchImpl(url, { headers: { 'user-agent': 'atc' }, signal: aborter.signal })
  if (!res.ok || !res.body)
    throw new AtcError('ATC_UPDATE_FAILED', `Could not download ${url} (${res.status}).`)
  const length = Number(res.headers.get('content-length') ?? NaN)
  const hash = createHash('sha256')
  const handle = await open(path, 'w', 0o700)
  const reader = res.body.getReader()
  let written = 0
  try {
    for (;;) {
      const { done, value } = await withinStall(reader.read(), stallMs, url)
      if (done) break
      hash.update(value)
      await handle.write(value, 0, value.byteLength, written)
      written += value.byteLength
    }
  } catch (error) {
    aborter.abort()
    // Bun can leave a cancel pending too: never wait for it.
    void reader.cancel().catch(() => undefined)
    if (error instanceof AtcError) throw error
    throw new AtcError('ATC_UPDATE_FAILED', `The download of ${url} broke off after ${written} bytes.`, {
      details: (error as Error).message,
    })
  } finally {
    await handle.close()
  }
  if (Number.isFinite(length) && written !== length)
    throw new AtcError(
      'ATC_UPDATE_FAILED',
      `The download of ${url} ended after ${written} of ${length} bytes.`
    )
  return hash.digest('hex')
}

/** `read` settled in time, or an error: a chunk that never comes must not hold the command forever. */
function withinStall<T>(read: Promise<T>, stallMs: number, url: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new AtcError(
            'ATC_UPDATE_FAILED',
            `The download of ${url} stalled: nothing arrived for ${Math.round(stallMs / 1000)} s.`,
            { hint: 'check the connection and run `atc update` again' }
          )
        ),
      stallMs
    )
  })
  return Promise.race([read, stalled]).finally(() => clearTimeout(timer))
}
