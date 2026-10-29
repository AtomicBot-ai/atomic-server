/**
 * The SPA, embedded as gzipped base64 in a generated module and decoded on first request. Any
 * path that is not a file gets `index.html`, so the router owns the URL space.
 */

import { gunzipSync } from 'node:zlib'
import { ADMIN_ASSETS, ADMIN_BUILD_ID } from './static-assets.generated.js'

export interface StaticResponse {
  status: number
  headers: Record<string, string>
  body: Buffer
}

const cache = new Map<string, Buffer>()

function bodyOf(path: string): Buffer | undefined {
  const asset = ADMIN_ASSETS[path]
  if (!asset) return undefined
  let body = cache.get(path)
  if (!body) {
    body = gunzipSync(Buffer.from(asset.gz, 'base64'))
    cache.set(path, body)
  }
  return body
}

export function serveStatic(pathname: string): StaticResponse | undefined {
  const clean = pathname.replace(/^\/+/, '') || 'index.html'
  const direct = ADMIN_ASSETS[clean] ? clean : undefined
  const path = direct ?? (clean.includes('.') ? undefined : 'index.html')
  if (!path) return undefined
  const body = bodyOf(path)
  if (!body) return undefined
  const hashed = /\.[0-9a-f]{8,}\./.test(path)
  return {
    status: 200,
    headers: {
      'content-type': ADMIN_ASSETS[path]?.type ?? 'application/octet-stream',
      'content-length': String(body.length),
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
      'x-frame-options': 'DENY',
      'x-atc-admin-build': ADMIN_BUILD_ID,
    },
    body,
  }
}

export { ADMIN_BUILD_ID }
