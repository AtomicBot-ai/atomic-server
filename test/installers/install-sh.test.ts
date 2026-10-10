/**
 * `scripts/install.sh` end to end against a release served from loopback (`ATC_DOWNLOAD_BASE`). The
 * machine it runs on is faked: `uname`, `ldd` and `sysctl` are shims on a sandboxed PATH that holds
 * only the tools the script needs, and `/proc/cpuinfo` is a file (`ATC_CPUINFO`). Each fake binary
 * prints its triple, so the test reads which one was installed by running it.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TARGETS, assetName } from '../../src/update/targets.js'
import { ROOT } from '../helpers/binary.js'

const SCRIPT = join(ROOT, 'scripts', 'install.sh')
const TOOLS = [
  'sh',
  'awk',
  'grep',
  'curl',
  'mktemp',
  'rm',
  'cp',
  'chmod',
  'mv',
  'mkdir',
  'cat',
  'dirname',
  'basename',
  'ls',
  'head',
  'printf',
]
const SHA_TOOLS = ['sha256sum', 'shasum']
const VERSION = '9.9.9'

const root = mkdtempSync(join(tmpdir(), 'atc-install-sh-'))
const release = join(root, 'release')
let server: Server
let base = ''
const sums: Record<string, string> = {}

function which(tool: string): string | undefined {
  const r = spawnSync('sh', ['-c', `command -v ${tool}`], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : undefined
}

function writeSums(override: Record<string, string> = {}) {
  const lines = Object.entries({ ...sums, ...override }).map(([name, hash]) => `${hash}  ${name}`)
  writeFileSync(join(release, 'SHA256SUMS'), `${lines.join('\n')}\n`)
}

beforeAll(async () => {
  mkdirSync(release, { recursive: true })
  for (const t of TARGETS.filter((x) => x.platform !== 'win32')) {
    const name = assetName(VERSION, t)
    const body = `#!/bin/sh\necho "${VERSION} ${t.triple}"\n`
    writeFileSync(join(release, name), body)
    sums[name] = createHash('sha256').update(body).digest('hex')
  }
  writeSums()
  server = createServer((req, res) => {
    const file = join(release, decodeURIComponent((req.url ?? '/').slice(1)))
    if (!existsSync(file)) return void res.writeHead(404).end()
    res.end(readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

interface Machine {
  os?: 'Linux' | 'Darwin'
  cpu?: 'x86_64' | 'aarch64' | 'arm64'
  musl?: boolean
  avx2?: boolean
  rosetta?: boolean
  shaTools?: boolean
}

/**
 * Run the script without blocking this process: the release is served from here, so a synchronous
 * spawn would leave curl waiting forever.
 */
function runScript(
  env: NodeJS.ProcessEnv
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('sh', [SCRIPT], { env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString()))
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

let runs = 0
async function install(machine: Machine = {}, env: Record<string, string> = {}) {
  const dir = join(root, `run-${(runs += 1)}`)
  const bin = join(dir, 'path')
  const home = join(dir, 'home')
  mkdirSync(bin, { recursive: true })
  mkdirSync(home, { recursive: true })
  for (const tool of [...TOOLS, ...(machine.shaTools === false ? [] : SHA_TOOLS)]) {
    const real = which(tool)
    if (real) symlinkSync(real, join(bin, tool))
  }
  const shim = (name: string, body: string) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  shim(
    'uname',
    `case "$1" in -s) echo ${machine.os ?? 'Linux'} ;; -m) echo ${machine.cpu ?? 'x86_64'} ;; esac`
  )
  shim('ldd', machine.musl ? 'echo "musl libc (x86_64)" >&2; exit 1' : 'echo "ldd (GNU libc) 2.39"')
  shim('sysctl', `echo ${machine.rosetta ? 1 : 0}`)
  const cpuinfo = join(dir, 'cpuinfo')
  writeFileSync(cpuinfo, `flags\t: fpu sse sse2 avx ${machine.avx2 === false ? '' : 'avx2 '}bmi1\n`)
  const r = await runScript({
    PATH: bin,
    HOME: home,
    SHELL: '/bin/sh',
    TMPDIR: dir,
    ATC_DOWNLOAD_BASE: base,
    ATC_INSTALL_DIR: join(dir, 'install'),
    ATC_CPUINFO: cpuinfo,
    ATC_NO_PATH: '1',
    ...env,
  })
  const installed = join(dir, 'install', 'atc')
  const triple = () => spawnSync(installed, [], { encoding: 'utf8' }).stdout.trim().split(' ')[1]
  return { ...r, dir, home, installed, triple }
}

describe('install.sh picks the binary for the machine', () => {
  it.each([
    [{ os: 'Linux', cpu: 'x86_64' }, 'x86_64-unknown-linux-gnu'],
    [{ os: 'Linux', cpu: 'x86_64', avx2: false }, 'x86_64-unknown-linux-gnu-baseline'],
    [{ os: 'Linux', cpu: 'x86_64', musl: true }, 'x86_64-unknown-linux-musl'],
    [{ os: 'Linux', cpu: 'aarch64' }, 'aarch64-unknown-linux-gnu'],
    [{ os: 'Linux', cpu: 'aarch64', musl: true }, 'aarch64-unknown-linux-musl'],
    [{ os: 'Linux', cpu: 'aarch64', avx2: false }, 'aarch64-unknown-linux-gnu'],
    [{ os: 'Darwin', cpu: 'arm64' }, 'aarch64-apple-darwin'],
    [{ os: 'Darwin', cpu: 'x86_64' }, 'x86_64-apple-darwin'],
    [{ os: 'Darwin', cpu: 'x86_64', rosetta: true }, 'aarch64-apple-darwin'],
  ] as const)('%j → %s', async (machine, triple) => {
    const r = await install(machine)
    expect(r.status, r.stderr).toBe(0)
    expect(r.triple()).toBe(triple)
    expect(r.stdout).toContain('checksum verified')
  })
})

describe('install.sh refuses rather than installing something unverified', () => {
  it('stops on a checksum mismatch and leaves nothing behind', async () => {
    writeSums({
      [assetName(VERSION, { triple: 'x86_64-unknown-linux-gnu', platform: 'linux' })]: '0'.repeat(64),
    })
    try {
      const r = await install()
      expect(r.status).not.toBe(0)
      expect(r.stderr).toContain('checksum mismatch')
      expect(existsSync(r.installed)).toBe(false)
      expect(existsSync(join(r.dir, 'install')) ? readdirSync(join(r.dir, 'install')) : []).toEqual([])
    } finally {
      writeSums()
    }
  })

  it('stops when there is no tool to verify the download with', async () => {
    const r = await install({ shaTools: false })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('no sha256sum or shasum')
    expect(existsSync(r.installed)).toBe(false)
  })

  it('names the assets when this machine has no binary', async () => {
    const musl = assetName(VERSION, { triple: 'aarch64-unknown-linux-musl', platform: 'linux' })
    const { [musl]: _left, ...rest } = sums
    writeFileSync(
      join(release, 'SHA256SUMS'),
      Object.entries(rest)
        .map(([n, h]) => `${h}  ${n}\n`)
        .join('')
    )
    try {
      const r = await install({ os: 'Linux', cpu: 'aarch64', musl: true })
      expect(r.status).not.toBe(0)
      expect(r.stderr).toContain('no binary for aarch64-unknown-linux-musl')
      expect(r.stderr).toContain('atc-9.9.9-aarch64-unknown-linux-gnu')
    } finally {
      writeSums()
    }
  })

  it('refuses an unknown CPU', async () => {
    const r = await install({ cpu: 'riscv64' as never })
    expect(r.status).not.toBe(0)
    expect(r.stderr).toContain('unsupported CPU: riscv64')
  })
})

describe('install.sh and PATH', () => {
  it('adds the folder to the shell rc once, however often it runs', async () => {
    const first = await install({}, { ATC_NO_PATH: '0', SHELL: '/bin/zsh' })
    expect(first.status, first.stderr).toBe(0)
    const again = await runScript({
      PATH: join(first.dir, 'path'),
      HOME: first.home,
      SHELL: '/bin/zsh',
      TMPDIR: first.dir,
      ATC_DOWNLOAD_BASE: base,
      ATC_INSTALL_DIR: join(first.dir, 'install'),
      ATC_CPUINFO: join(first.dir, 'cpuinfo'),
    })
    expect(again.status, again.stderr).toBe(0)
    const rc = readFileSync(join(first.home, '.zshrc'), 'utf8')
    expect(rc.match(/# added by atc installer/g)).toHaveLength(1)
    expect(rc).toContain(join(first.dir, 'install'))
  })
})
