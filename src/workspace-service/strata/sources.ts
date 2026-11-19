import { randomUUID } from 'node:crypto'
import { constants, createWriteStream } from 'node:fs'
import { mkdir, open, realpath, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { StrataFile, StrataModelDescriptor } from '@atomic-chat/core/contracts'
import { verifyDownloadedFile } from '../../downloads/index.js'
import type { Downloader, ProxyConfig } from '../../downloads/index.js'
import { replaceFile } from '../../terminal-data/index.js'
import { hubAuthorized } from '../models/hub-fetch.js'

const HUB = 'https://huggingface.co'

export function strataDownloadItems(
  destination: string,
  descriptor: StrataModelDescriptor,
  proxy?: ProxyConfig | null
) {
  return descriptor.files.map((file) => {
    const source = descriptor.sources.find((candidate) => candidate.id === file.source)!
    const path = file.source_path.split('/').map(encodeURIComponent).join('/')
    const url =
      source.host === 'huggingface'
        ? `${HUB}/${source.repo}/resolve/${source.revision}/${path}`
        : `https://raw.githubusercontent.com/${source.repo}/${source.revision}/${path}`
    return {
      url,
      size: file.size,
      sha256: file.sha256,
      save_path: join(destination, file.path),
      ...(proxy ? { proxy } : {}),
    }
  })
}

/** The descriptor has been validated by the core. Only the server's downloader receives the token. */
export function downloadStrataSources(
  download: Downloader['download'],
  id: string,
  destination: string,
  descriptor: StrataModelDescriptor,
  proxy: ProxyConfig | null,
  token?: string
) {
  return download(id, strataDownloadItems(destination, descriptor, proxy), {
    resume: true,
    wrapFetch: (fetch) => hubAuthorized(fetch, HUB, token),
  })
}

async function verifiedImport(file: StrataFile, target: string, signal: AbortSignal) {
  signal.throwIfAborted()
  const verified = await verifyDownloadedFile(file, target, undefined, signal).then(
    () => true,
    () => false
  )
  signal.throwIfAborted()
  return verified
}

export async function stagedStrataImportBytes(
  destination: string,
  files: readonly StrataFile[],
  signal: AbortSignal
) {
  let bytes = 0
  for (const file of files)
    if (await verifiedImport(file, join(destination, file.path), signal)) bytes += file.size
  return bytes
}

/** Stage an independent, verified copy. An imported directory remains owned by its original user. */
export async function importStrataSources(
  directory: string,
  destination: string,
  files: readonly StrataFile[],
  signal: AbortSignal
): Promise<void> {
  const root = await realpath(directory)
  for (const file of files) {
    const target = join(destination, file.path)
    if (await verifiedImport(file, target, signal)) continue
    const source = await realpath(join(root, file.path))
    const inside = relative(root, source)
    if (isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep))
      throw new Error(`Strata import file escapes the selected directory: ${file.path}`)
    const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK)
    const temporary = target + '.' + randomUUID() + '.tmp'
    try {
      const stat = await handle.stat()
      if (!stat.isFile() || stat.size !== file.size)
        throw new Error(`Strata import file has the wrong size or type: ${file.path}`)
      await mkdir(dirname(target), { recursive: true, mode: 0o700 })
      await pipeline(
        handle.createReadStream({ autoClose: false, end: file.size - 1 }),
        createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
        { signal }
      )
      await verifyDownloadedFile(file, temporary, undefined, signal)
      signal.throwIfAborted()
      await replaceFile(temporary, target)
    } finally {
      await handle.close()
      await rm(temporary, { force: true })
    }
  }
}
