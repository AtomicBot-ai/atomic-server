/**
 * The compiled program end to end: `dist/bin/atc-*` when built, otherwise `node dist/bin.js`
 * (`npm run build`). A real daemon is started in a temporary folder and stopped again.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, ROOT } from '../helpers/binary.js'

const command = [...ATC]
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

  it('rejects unknown commands and malformed operation inputs', () => {
    expect(atc('bogus').code).toBe(2)
    const stub = atc('control', 'call', 'api.start', '--input', '[]', '--json')
    expect(stub.code).toBe(2)
    expect(JSON.parse(stub.err)).toMatchObject({ error: { code: 'ATC_USAGE' } })
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
    const operations = atc('control', 'list', '--json')
    expect(operations.code, operations.err).toBe(0)
    expect(JSON.parse(operations.out).operations).toContainEqual(
      expect.objectContaining({ name: 'models.plan' })
    )
    const manual = atc('setup', 'manual', '--json')
    expect(manual.code, manual.err).toBe(0)
    const watch = atc('control', 'watch', '--count', '1')
    expect(watch.code, watch.err).toBe(0)
    expect(JSON.parse(watch.out).snapshot.setup).toMatchObject({ mode: 'manual' })
    const [mcpExe, ...mcpPrefix] = command
    const mcp = spawnSync(mcpExe!, [...mcpPrefix, 'mcp', '--data-folder', dataFolder], {
      encoding: 'utf8',
      timeout: 10000,
      input:
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
          { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        ]
          .map((v) => JSON.stringify(v))
          .join('\n') + '\n',
    })
    expect(mcp.status, mcp.stderr).toBe(0)
    const replies = mcp.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(replies.find((r) => r.id === 2).result.tools).toContainEqual(
      expect.objectContaining({ name: 'api_ping' })
    )
    const again = atc('start', '--json')
    expect(JSON.parse(again.out)).toMatchObject({ started: false })
    expect(atc('config', 'set', 'api.port', '0').code).toBe(0)
    const api = atc('api', 'start', '--json')
    expect(api.code, api.err).toBe(0)
    const endpoint = JSON.parse(api.out) as {
      port: number
      prefix: string
      running: boolean
      keys_file: string
    }
    expect(endpoint.running).toBe(true)
    const url = `http://127.0.0.1:${endpoint.port}${endpoint.prefix}/models`
    // Every client needs a key from the keyring the server created; none was configured here.
    expect((await fetch(url)).status).toBe(401)
    const key = (JSON.parse(readFileSync(endpoint.keys_file, 'utf8')) as { keys: Array<{ token: string }> })
      .keys[0]!
    expect((await fetch(url, { headers: { authorization: `Bearer ${key.token}` } })).status).toBe(200)
    expect(atc('api', 'stop', '--json').code).toBe(0)
    expect(JSON.parse(atc('api', 'status', '--json').out).running).toBe(false)
    expect(JSON.parse(atc('status', '--json').out).running).toBe(true)
    const stop = atc('stop', '--json')
    expect(stop.code, stop.err).toBe(0)
    expect(JSON.parse(atc('status', '--json').out)).toMatchObject({ running: false })
  })

  it('replaces a server another build left running: status says so, restart and stop reach it', (t) => {
    const start = atc('start', '--no-admin', '--json')
    expect(start.code, start.err).toBe(0)
    // What an update leaves behind: the server's lock names another core version.
    const lockPath = join(dataFolder, 'atomic-core', 'instance.lock')
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Record<string, unknown>
    try {
      writeFileSync(lockPath, JSON.stringify({ ...lock, version: '0.0.1' }))
    } catch (error) {
      // Windows may refuse to write a file the owner holds open; the contract test covers the logic.
      atc('stop', '--force', '--kill')
      t.skip(`cannot rewrite a held lock here: ${String(error)}`)
    }
    const status = atc('status', '--json')
    expect(status.code, status.err).toBe(0)
    expect(JSON.parse(status.out)).toMatchObject({ running: true, outdated: true, core_version: '0.0.1' })
    // restart starts with the configured admin port; the default may be taken on a dev machine.
    expect(atc('config', 'set', 'admin.port', '0').code).toBe(0)
    const restart = atc('restart', '--json')
    expect(restart.code, restart.err).toBe(0)
    const after = JSON.parse(restart.out) as { started: boolean; stopped: boolean; instance_id: string }
    expect(after).toMatchObject({ started: true, stopped: true })
    expect(after.instance_id).not.toBe(lock['instance_id'])
    expect(JSON.parse(atc('status', '--json').out)).toMatchObject({ running: true })
    expect(JSON.parse(atc('status', '--json').out).outdated).toBeUndefined()
    expect(atc('stop', '--json').code).toBe(0)
  })

  it.skipIf(process.platform === 'win32')(
    'shuts down cleanly on SIGTERM during startup, leaving no run record',
    async () => {
      const [exe, ...prefix] = command
      const folder = join(dataFolder, '..', 'sigterm')
      const recordPath = join(folder, 'atc', 'run', 'daemon.json')
      const child = spawn(exe as string, [...prefix, 'daemon', '--no-admin', '--data-folder', folder], {
        env: { ...process.env, NO_COLOR: '1' },
        stdio: 'ignore',
      })
      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
        child.once('exit', (code, signal) => resolve({ code, signal }))
      )
      // The `starting` record is written after the core is up and before the admin and the probe.
      const deadline = Date.now() + 30_000
      while (!existsSync(recordPath) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20))
      child.kill('SIGTERM')
      expect(await exited).toEqual({ code: 0, signal: null })
      expect(existsSync(recordPath)).toBe(false)
      expect(existsSync(join(folder, 'atomic-core', 'instance.lock'))).toBe(false)
    },
    60_000
  )

  it.skipIf(process.platform === 'win32')(
    'runs in the foreground with `start --foreground` and stops gracefully on SIGTERM',
    async () => {
      const [exe, ...prefix] = command
      const folder = join(dataFolder, '..', 'foreground')
      const child = spawn(
        exe as string,
        [...prefix, 'start', '--foreground', '--no-admin', '--data-folder', folder],
        { env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'ignore'] }
      )
      const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
        child.once('exit', (code, signal) => resolve({ code, signal }))
      )
      // The ready line on stdout says the server owns the folder.
      await new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()))
      const [exe2, ...prefix2] = command
      const running = spawnSync(exe2 as string, [...prefix2, 'status', '--json', '--data-folder', folder], {
        encoding: 'utf8',
      })
      expect(JSON.parse(running.stdout)).toMatchObject({ running: true })
      child.kill('SIGTERM')
      expect(await exited).toEqual({ code: 0, signal: null })
      expect(existsSync(join(folder, 'atomic-core', 'instance.lock'))).toBe(false)
    },
    60_000
  )

  it('keeps its own log: `atc logs` shows it, `atc logs -f` follows it live', async () => {
    const folder = join(dataFolder, '..', 'logs')
    const run = (...args: string[]) => {
      const [exe, ...prefix] = command
      return spawnSync(exe as string, [...prefix, ...args, '--data-folder', folder], { encoding: 'utf8' })
    }
    expect(run('config', 'set', 'admin.port', '0').status).toBe(0)
    expect(run('start', '--json').status).toBe(0)
    const logs = run('logs', '--json')
    expect(logs.status).toBe(0)
    expect((JSON.parse(logs.stdout) as { lines: string[] }).lines.join('\n')).toContain('daemon ready')
    const [exe, ...prefix] = command
    const follower = spawn(exe as string, [...prefix, 'logs', '-f', '-n', '1', '--data-folder', folder], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let seen = ''
    follower.stdout!.on('data', (chunk: Buffer) => (seen += chunk.toString()))
    await new Promise((r) => setTimeout(r, 1000))
    expect(run('stop').status).toBe(0)
    const deadline = Date.now() + 10_000
    while (!seen.includes('core stopped') && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 100))
    follower.kill()
    expect(seen).toContain('core stopped')
  }, 60_000)

  it.runIf(process.platform === 'win32')(
    "keeps atc's folder to this user on Windows, even outside the profile",
    () => {
      // Inside the checkout the folder would inherit BUILTIN\\Users from the drive.
      const folder = join(ROOT, '.e2e-acl', 'data')
      try {
        const [exe, ...prefix] = command
        const run = (...args: string[]) =>
          spawnSync(exe as string, [...prefix, ...args, '--data-folder', folder], { encoding: 'utf8' })
        expect(run('config', 'set', 'admin.port', '0').status).toBe(0)
        expect(run('start', '--no-admin').status).toBe(0)
        const icacls = (...path: string[]) =>
          spawnSync('icacls', [join(folder, 'atc', ...path)], { encoding: 'utf8' }).stdout
        const acl = icacls('client-keys.json')
        // Where the open entry comes from (the folder, or only this file), and what the server logged.
        const why = () =>
          [acl, icacls(), icacls('config.json'), icacls('logs'), run('logs', '-n', '50').stdout].join('\n')
        expect(acl, why()).not.toMatch(/BUILTIN\\Users|Everyone|Authenticated Users/i)
        expect(acl.toLowerCase()).toContain((process.env['USERNAME'] ?? '').toLowerCase())
        run('stop', '--force', '--kill')
      } finally {
        rmSync(join(ROOT, '.e2e-acl'), { recursive: true, force: true })
      }
    },
    60_000
  )

  it('prints a completion script', () => {
    const bash = atc('completion', 'bash')
    expect(bash.code).toBe(0)
    expect(bash.out).toContain('complete -F _atc atc')
  })
})
