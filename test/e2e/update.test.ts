/**
 * `atc update` on the built binary: a copy of it in a folder of its own updates itself from a GitHub
 * stand-in on loopback (`ATC_GITHUB_API`) that serves the same binary as the release, and restarts the
 * server it had started. A second run with a tampered SHA256SUMS must leave the binary alone.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ATC_VERSION } from '../../src/version.js'
import { assetName, targetFor } from '../../src/update/targets.js'
import { BINARY } from '../helpers/binary.js'

const enabled = existsSync(BINARY)
const root = mkdtempSync(join(tmpdir(), 'atc-update-'))
const installed = join(root, 'bin', process.platform === 'win32' ? 'atc.exe' : 'atc')
const dataFolder = join(root, 'data')
const target = targetFor(process.platform, process.arch)!
const asset = assetName(ATC_VERSION, target)
let sums = ''
let server: Server | undefined
let api = ''

beforeAll(async () => {
  if (!enabled) return
  mkdirSync(join(root, 'bin'), { recursive: true })
  copyFileSync(BINARY, installed)
  const body = readFileSync(BINARY)
  sums = `${createHash('sha256').update(body).digest('hex')}  ${asset}\n`
  server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (url.startsWith('/repos/')) {
      const tag = `v${ATC_VERSION}`
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          tag_name: tag,
          html_url: `${api}/release/${tag}`,
          assets: [asset, 'SHA256SUMS'].map((name) => ({
            name,
            browser_download_url: `${api}/download/${name}`,
            size: 0,
          })),
        })
      )
    } else if (url === '/download/SHA256SUMS') res.end(sums)
    else if (url === `/download/${asset}`) res.end(body)
    else res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  if (enabled) await run(['stop', '--force', '--kill', '--data-folder', dataFolder])
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

/** Asynchronous: the release is served from this process, so a blocking spawn would wait forever. */
function run(args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(installed, args, { env: { ...process.env, NO_COLOR: '1', ATC_GITHUB_API: api } })
    let out = ''
    let err = ''
    child.stdout.on('data', (c: Buffer) => (out += c.toString()))
    child.stderr.on('data', (c: Buffer) => (err += c.toString()))
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

describe.runIf(enabled)('atc update on the built binary', () => {
  it('replaces itself with the verified release and restarts the server onto it', async () => {
    expect((await run(['config', 'set', 'admin.port', '0', '--data-folder', dataFolder])).code).toBe(0)
    const start = await run(['start', '--no-admin', '--json', '--data-folder', dataFolder])
    expect(start.code, start.err).toBe(0)
    const before = (JSON.parse(start.out) as { instance_id: string }).instance_id
    const inode = statSync(installed).ino
    const update = await run(['update', '--version', ATC_VERSION, '--json', '--data-folder', dataFolder])
    expect(update.code, update.err).toBe(0)
    expect(JSON.parse(update.out)).toMatchObject({ updated: true, to: ATC_VERSION, restarted: 'server' })
    // POSIX renames over the old inode; Windows moved the running file aside first.
    if (process.platform !== 'win32') expect(statSync(installed).ino).not.toBe(inode)
    expect((await run(['--version'])).out.trim()).toBe(ATC_VERSION)
    const status = JSON.parse((await run(['status', '--json', '--data-folder', dataFolder])).out) as {
      instance_id: string
    }
    expect(status.instance_id).not.toBe(before)
  })

  it('leaves the binary alone when the download does not match SHA256SUMS', async () => {
    const good = sums
    sums = `${'0'.repeat(64)}  ${asset}\n`
    try {
      const inode = statSync(installed).ino
      const update = await run(['update', '--version', ATC_VERSION, '--json', '--data-folder', dataFolder])
      expect(update.code).toBe(1)
      expect(update.err).toContain('ATC_CHECKSUM_MISMATCH')
      expect(statSync(installed).ino).toBe(inode)
      expect((await run(['--version'])).out.trim()).toBe(ATC_VERSION)
    } finally {
      sums = good
    }
  })
})
