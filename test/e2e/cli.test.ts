/**
 * The compiled program end to end: `dist/bin/atc-*` when built, otherwise `node dist/bin.js`
 * (`npm run build`). A real daemon is started in a temporary folder and stopped again.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

// Not `.pathname`: on Windows that is `/C:/…`, which neither `join` nor `spawn` accepts.
const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const triple = { darwin: 'apple-darwin', win32: 'pc-windows-msvc', linux: 'unknown-linux-gnu' }[
  process.platform as 'darwin'
]
const cpu = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
const binary = join(ROOT, 'dist/bin', `atc-${cpu}-${triple}${process.platform === 'win32' ? '.exe' : ''}`)
const command = existsSync(binary) ? [binary] : [process.execPath, join(ROOT, 'dist/bin.js')]
const dataFolder = join(mkdtempSync(join(tmpdir(), 'atc-e2e-')), 'data')

function atc(...args: string[]) {
  const [exe, ...prefix] = command
  const res = spawnSync(exe as string, [...prefix, ...args, '--data-folder', dataFolder], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 60_000,
  })
  return { code: res.status, out: res.stdout, err: res.stderr }
}

afterAll(() => {
  atc('stop', '--force', '--kill')
  rmSync(join(dataFolder, '..'), { recursive: true, force: true })
})

describe(`atc (${command.join(' ')})`, () => {
  it('reports its version and help', () => {
    const version = atc('version', '--json')
    expect(version.code).toBe(0)
    expect(JSON.parse(version.out)).toMatchObject({ atc: expect.any(String), core: expect.any(String) })
    expect(atc('--help').out).toContain('Usage: atc <command>')
    expect(atc('').code).toBe(2)
  })

  it('exits 2 for unknown commands and 3 for stubs', () => {
    expect(atc('bogus').code).toBe(2)
    const stub = atc('models', 'pull', 'x', '--json')
    expect(stub.code).toBe(3)
    expect(JSON.parse(stub.err)).toMatchObject({ error: { code: 'ATC_NOT_IMPLEMENTED' } })
  })

  it('starts a daemon, serves and stops its public API, then stops the owner', async () => {
    const start = atc('start', '--admin-port', '0', '--json')
    expect(start.code, start.err).toBe(0)
    expect(JSON.parse(start.out)).toMatchObject({ started: true, running: true })
    const status = atc('status', '--json')
    expect(status.code).toBe(0)
    const body = JSON.parse(status.out) as { running: boolean; admin_url: string | null }
    expect(body.running).toBe(true)
    expect(body.admin_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const admin = atc('admin', 'status', '--json')
    expect(JSON.parse(admin.out)).toMatchObject({ running: true, admin_url: body.admin_url })
    const again = atc('start', '--json')
    expect(JSON.parse(again.out)).toMatchObject({ started: false })
    expect(atc('config', 'set', 'api.port', '0').code).toBe(0)
    expect(atc('config', 'set', 'api.requireKey', 'false').code).toBe(0)
    const api = atc('api', 'start', '--json')
    expect(api.code, api.err).toBe(0)
    const endpoint = JSON.parse(api.out) as { port: number; prefix: string; running: boolean }
    expect(endpoint.running).toBe(true)
    const models = await fetch(`http://127.0.0.1:${endpoint.port}${endpoint.prefix}/models`)
    expect(models.status).toBe(200)
    expect(atc('api', 'stop', '--json').code).toBe(0)
    expect(JSON.parse(atc('api', 'status', '--json').out).running).toBe(false)
    expect(JSON.parse(atc('status', '--json').out).running).toBe(true)
    const stop = atc('stop', '--json')
    expect(stop.code, stop.err).toBe(0)
    expect(JSON.parse(atc('status', '--json').out)).toMatchObject({ running: false })
  })

  it('prints a completion script', () => {
    const bash = atc('completion', 'bash')
    expect(bash.code).toBe(0)
    expect(bash.out).toContain('complete -F _atc atc')
  })
})
