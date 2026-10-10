/** The file operations an update needs, on the real file system; the download is hashed as it streams. */

import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { chmod, readdir, rename, rm } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { AtcError } from '../errors/index.js'
import type { UpdateFiles } from './apply.js'

export function nodeUpdateFiles(fetchImpl: typeof fetch): UpdateFiles {
  return {
    download: async (url, path) => {
      const res = await fetchImpl(url, { headers: { 'user-agent': 'atc' } })
      if (!res.ok || !res.body)
        throw new AtcError('ATC_UPDATE_FAILED', `Could not download ${url} (${res.status}).`)
      const hash = createHash('sha256')
      const body = Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>)
      body.on('data', (chunk: Buffer) => hash.update(chunk))
      await pipeline(body, createWriteStream(path, { mode: 0o700 }))
      return hash.digest('hex')
    },
    rename: (from, to) => rename(from, to),
    chmod: (path, mode) => chmod(path, mode),
    remove: (path) => rm(path, { force: true }),
    list: (dir) => readdir(dir),
  }
}
