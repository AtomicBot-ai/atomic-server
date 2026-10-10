/**
 * `scripts/install.ps1` on Windows against a release served from loopback (`ATC_DOWNLOAD_BASE`). The
 * asset is the built `atc.exe` (`npm run build:bin` first): the installer runs `--version` on what it
 * installed, so a stand-in file would not do. Both x64 names are served, since the script picks the
 * baseline build on a CPU without AVX2.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TARGETS, assetName } from '../../src/update/targets.js'
import { BINARY, ROOT } from '../helpers/binary.js'

const enabled = process.platform === 'win32' && existsSync(BINARY)
const VERSION = '9.9.9'
const root = mkdtempSync(join(tmpdir(), 'atc-install-ps1-'))
const release = join(root, 'release')
let server: Server | undefined
let base = ''
const sums: Record<string, string> = {}

const writeSums = (override: Record<string, string> = {}) =>
  writeFileSync(
    join(release, 'SHA256SUMS'),
    Object.entries({ ...sums, ...override })
      .map(([n, h]) => `${h}  ${n}\n`)
      .join('')
  )

beforeAll(async () => {
  if (!enabled) return
  mkdirSync(release, { recursive: true })
  const hash = createHash('sha256').update(readFileSync(BINARY)).digest('hex')
  for (const t of TARGETS.filter(
    (x) => x.platform === 'win32' && x.arch === (process.arch === 'arm64' ? 'arm64' : 'x64')
  )) {
    copyFileSync(BINARY, join(release, assetName(VERSION, t)))
    sums[assetName(VERSION, t)] = hash
  }
  writeSums()
  server = createServer((req, res) => {
    const file = join(release, decodeURIComponent((req.url ?? '/').slice(1)))
    if (!existsSync(file)) return void res.writeHead(404).end()
    res.end(readFileSync(file))
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

let runs = 0
function install(): Promise<{ status: number | null; out: string; dir: string }> {
  const dir = join(root, `run-${(runs += 1)}`)
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(ROOT, 'scripts', 'install.ps1')],
      { env: { ...process.env, ATC_DOWNLOAD_BASE: base, ATC_INSTALL_DIR: dir, ATC_NO_PATH: '1' } }
    )
    let out = ''
    child.stdout.on('data', (c: Buffer) => (out += c.toString()))
    child.stderr.on('data', (c: Buffer) => (out += c.toString()))
    child.on('close', (status) => resolve({ status, out, dir }))
  })
}

describe.runIf(enabled)('install.ps1', () => {
  it('installs the binary for this CPU, verified, and runs it', async () => {
    const r = await install()
    expect(r.status, r.out).toBe(0)
    expect(r.out).toContain('checksum verified')
    expect(existsSync(join(r.dir, 'atc.exe'))).toBe(true)
    // Installing again over it replaces it and leaves no backup behind.
    const again = await install()
    expect(again.status, again.out).toBe(0)
  })

  it('stops on a checksum mismatch and installs nothing', async () => {
    writeSums(Object.fromEntries(Object.keys(sums).map((n) => [n, '0'.repeat(64)])))
    try {
      const r = await install()
      expect(r.status).not.toBe(0)
      expect(r.out).toContain('checksum mismatch')
      expect(existsSync(join(r.dir, 'atc.exe'))).toBe(false)
    } finally {
      writeSums()
    }
  })
})
