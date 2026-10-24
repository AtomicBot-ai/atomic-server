import { Unzip, UnzipInflate } from 'fflate'
const MAX_EXPANDED = 64 * 1024 * 1024
/** Read an archive without extracting paths or trusting declared expansion sizes. */
export function readArchive(data: Uint8Array): Map<string, Uint8Array> {
  validateDirectory(data)
  const entries = new Map<string, Uint8Array>()
  let expanded = 0,
    count = 0,
    pending = 0
  const archive = new Unzip((file) => {
    if (++count > 256) throw new Error('The archive contains too many files (maximum 256).')
    const name = file.name
    if (
      !name ||
      name.includes('\\') ||
      name.startsWith('/') ||
      /^[A-Za-z]:/.test(name) ||
      name.split('/').some((part) => part === '..' || part === '.')
    )
      throw new Error('The archive contains an unsafe file path.')
    if (entries.has(name)) throw new Error('The archive contains duplicate file paths.')
    if ((file.originalSize ?? 0) > MAX_EXPANDED) throw new Error('The archive expands beyond 64 MB.')
    entries.set(name, new Uint8Array())
    const chunks: Uint8Array[] = []
    let size = 0
    pending++
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      expanded += chunk.length
      size += chunk.length
      if (expanded > MAX_EXPANDED) {
        file.terminate()
        throw new Error('The archive expands beyond 64 MB.')
      }
      chunks.push(chunk)
      if (final) {
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const value of chunks) {
          bytes.set(value, offset)
          offset += value.length
        }
        entries.set(name, bytes)
        pending--
      }
    }
    file.start()
  })
  archive.register(UnzipInflate)
  try {
    for (let offset = 0; offset < data.length; offset += 2048)
      archive.push(data.subarray(offset, offset + 2048), offset + 2048 >= data.length)
  } catch (error) {
    throw new Error(`Cannot read archive: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!entries.size || pending) throw new Error('The archive is empty or incomplete.')
  return entries
}

function validateDirectory(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let end = -1
  for (let at = data.length - 22; at >= Math.max(0, data.length - 65557); at--)
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === data.length) {
      end = at
      break
    }
  if (end < 0) throw new Error('The archive is incomplete: its final directory is missing.')
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    offset = view.getUint32(end + 16, true)
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count === 65535 ||
    size === 0xffffffff ||
    offset === 0xffffffff
  )
    throw new Error('Split and ZIP64 archives are not supported.')
  if (offset + size !== end) throw new Error('The archive directory is invalid.')
  if (count > 256) throw new Error('The archive contains too many files (maximum 256).')
  let at = offset
  for (let index = 0; index < count; index++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50)
      throw new Error('The archive directory is invalid.')
    if (view.getUint16(at + 8, true) & 1) throw new Error('Unlock this archive before importing it.')
    if (view.getUint32(at + 24, true) > MAX_EXPANDED) throw new Error('The archive expands beyond 64 MB.')
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
  }
  if (at !== end) throw new Error('The archive directory is invalid.')
}
