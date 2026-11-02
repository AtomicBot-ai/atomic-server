import type { IncomingMessage, ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { relative, isAbsolute } from 'node:path'
import type { CoreLink } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'
import type { AudioGalleryItem, AudioGalleryPage, AudioStatus } from '../contract/index.js'

const PAGE = 100

/** The core has no lookup of one clip: its gallery is read page by page, newest first. */
async function audioClip(link: CoreLink, id: string): Promise<AudioGalleryItem | null> {
  for (let offset = 0; ; offset += PAGE) {
    const page = await link.request<AudioGalleryPage>('GET', `/audio/gallery?offset=${offset}&limit=${PAGE}`)
    const item = page.items.find((candidate) => candidate.id === id)
    if (item || !page.hasMore || !page.items.length) return item ?? null
  }
}

/** The file of a gallery item and the folder it must be inside. */
async function galleryFile(link: CoreLink, kind: string, id: string) {
  if (kind === 'audio') {
    const [item, status] = await Promise.all([
      audioClip(link, id),
      link.request<AudioStatus>('GET', '/audio/status'),
    ])
    return { item, folder: status.outputDir }
  }
  const prefix = kind === 'image' ? '/diffusion' : '/diffusion/video'
  const [{ item }, status] = await Promise.all([
    link.request<{ item: { path: string } | null }>('GET', `${prefix}/gallery/${id}`),
    link.request<{ outputDir: string; videoOutputDir: string }>('GET', '/diffusion/status'),
  ])
  return { item, folder: kind === 'image' ? status.outputDir : status.videoOutputDir }
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  image: 'image/png',
  video: 'video/webm',
  audio: 'audio/wav',
}

/** Only Core gallery IDs can name a media file; client paths never enter the filesystem. */
export async function serveWorkspaceAsset(
  link: CoreLink,
  req: IncomingMessage,
  res: ServerResponse,
  kind: string,
  id: string
): Promise<void> {
  if (!(kind in CONTENT_TYPES) || !/^[a-f0-9-]{1,80}$/i.test(id))
    throw new AtcError('ATC_USAGE', 'Unknown media item.')
  const { item, folder } = await galleryFile(link, kind, id)
  if (!item) throw new AtcError('ATC_USAGE', 'This media item no longer exists.')
  const [path, root] = await Promise.all([realpath(item.path), realpath(folder)])
  const rel = relative(root, path)
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new AtcError('ATC_USAGE', 'The media file is outside the gallery.')
  const info = await stat(path)
  if (!info.isFile()) throw new AtcError('ATC_USAGE', 'This media item is not a file.')
  let start = 0,
    end = info.size - 1,
    code = 200
  const range = req.headers.range
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range)
    if (!match) {
      res.writeHead(416, { 'content-range': `bytes */${info.size}` })
      res.end()
      return
    }
    start = Number(match[1])
    end = match[2] ? Math.min(Number(match[2]), end) : end
    if (start > end || start >= info.size) {
      res.writeHead(416, { 'content-range': `bytes */${info.size}` })
      res.end()
      return
    }
    code = 206
  }
  res.writeHead(code, {
    'content-type': CONTENT_TYPES[kind]!,
    'content-length': String(end - start + 1),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    ...(code === 206 ? { 'content-range': `bytes ${start}-${end}/${info.size}` } : {}),
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(path, { start, end })
  stream.on('error', () => res.destroy())
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}
