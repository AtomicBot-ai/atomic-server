import { createHash } from 'node:crypto'
import { mkdtemp, readFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { FixtureHttpServer } from '../../test/helpers/fixture-http-server.js'
import { Downloader } from './downloader.js'

const origin = new FixtureHttpServer()
const body = Buffer.from('weights through a proxy')
const sha = createHash('sha256').update(body).digest('hex')
const seen: Array<{ url: string; auth?: string }> = []
let proxy: Server
let proxyUrl = ''

/** A forward proxy for plain http: absolute-form requests, Basic auth required. */
beforeAll(async () => {
  await origin.start()
  proxy = createServer((req, res) => {
    seen.push({
      url: req.url ?? '',
      ...(req.headers['proxy-authorization'] ? { auth: req.headers['proxy-authorization'] } : {}),
    })
    if (req.headers['proxy-authorization'] !== `Basic ${Buffer.from('u:p').toString('base64')}`) {
      res.writeHead(407).end()
      return
    }
    const upstream = request(
      req.url ?? '',
      { method: req.method, headers: { ...req.headers, host: new URL(req.url ?? '').host } },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers)
        r.pipe(res)
      }
    )
    upstream.on('error', () => res.writeHead(502).end())
    req.pipe(upstream)
  })
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r))
  const address = proxy.address()
  proxyUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})
afterAll(async () => {
  await origin.stop()
  await new Promise<void>((r) => proxy.close(() => r()))
})
beforeEach(() => {
  origin.reset()
  seen.length = 0
  origin.files.set('/m.gguf', { body })
})

async function download(proxyConfig: Record<string, unknown>) {
  const dataFolder = await mkdtemp(join(tmpdir(), 'atc-proxy-'))
  const dl = new Downloader({ dataFolder, platform: 'linux', fetch, availableSpace: async () => undefined })
  await dl.download('t', [
    {
      url: origin.url('/m.gguf'),
      save_path: 'models/m.gguf',
      sha256: sha,
      size: body.length,
      proxy: proxyConfig as never,
    },
  ])
  return readFile(join(dataFolder, 'models/m.gguf'))
}

describe('Downloader through a proxy', () => {
  it('sends the request through the proxy with its credentials', async () => {
    expect((await download({ url: proxyUrl, username: 'u', password: 'p' })).equals(body)).toBe(true)
    expect(seen).toEqual([{ url: origin.url('/m.gguf'), auth: expect.stringMatching(/^Basic /) }])
  })

  it('goes direct for a host on the no_proxy list', async () => {
    expect((await download({ url: proxyUrl, no_proxy: ['127.0.0.1'] })).equals(body)).toBe(true)
    expect(seen).toEqual([])
  })

  it('refuses a proxy it cannot use before any request', async () => {
    await expect(download({ url: 'ftp://127.0.0.1:1' })).rejects.toThrow('Unsupported proxy scheme')
    await expect(download({ url: proxyUrl })).rejects.toThrow('407')
    expect(origin.requests).toEqual([])
  })
})
