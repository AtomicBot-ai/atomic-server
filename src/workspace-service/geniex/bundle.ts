import { createReadStream, closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Unzip, UnzipInflate } from 'fflate'

/** Extract regular files into a new private directory. Qualcomm ZIPs commonly wrap the model in one folder. */
export async function unpackBundle(archive: string, root: string, cancelled: () => boolean) {
  const handles = new Set<number>()
  let bytes = 0
  const unzip = new Unzip((entry) => {
    const path = entry.name.replace(/\/$/, '')
    if (
      !path ||
      path.split('/').some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /[<>:"\\|?*]/.test(part) ||
          Array.from(part).some((c) => c.charCodeAt(0) < 32) ||
          /[. ]$/.test(part) ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
          // core-boundary: model.yml — refuse bundled registrations; only the verified installer creates one.
          part.toLowerCase() === 'model.yml'
      )
    )
      throw new Error('Unsafe path in GenieX bundle.')
    const target = join(root, path)
    if (entry.name.endsWith('/')) return
    mkdirSync(dirname(target), { recursive: true })
    const fd = openSync(target, 'wx')
    handles.add(fd)
    entry.ondata = (error, data, final) => {
      if (error) throw error
      for (let pos = 0; pos < data.byteLength;) pos += writeSync(fd, data, pos, data.byteLength - pos)
      bytes += data.byteLength
      if (final) {
        closeSync(fd)
        handles.delete(fd)
      }
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  try {
    for await (const chunk of createReadStream(archive)) {
      if (cancelled()) throw new Error('Extraction cancelled.')
      unzip.push(chunk as Buffer)
    }
    unzip.push(new Uint8Array(0), true)
    if (handles.size || !bytes) throw new Error('Incomplete GenieX bundle.')
    const entries = await readdir(root, { withFileTypes: true })
    return {
      dir: entries.length === 1 && entries[0]!.isDirectory() ? join(root, entries[0]!.name) : root,
      bytes,
    }
  } finally {
    for (const fd of handles) closeSync(fd)
  }
}
