/**
 * The compiled program end to end: `dist/bin/atc-*` when built, otherwise `node dist/bin.js`
 * (`npm run build`). A real daemon is started in a temporary folder and stopped again.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CORE_VERSION } from '@atomic-chat/core'
import { judgeWindowsAcl, readWindowsAcl } from '@atomic-chat/core/host'
import { afterAll, describe, expect, it } from 'vitest'
import { overlayWindowsEnv } from '../../src/host/index.js'
import { ATC, ROOT } from '../helpers/binary.js'
import { runAtcAsync, runProcess } from '../helpers/async-binary.js'

const command = [...ATC]
const dataFolder = join(mkdtempSync(join(tmpdir(), 'atc-e2e-')), 'data')

const atc = (...args: string[]) => runAtcAsync([...args, '--data-folder', dataFolder])

afterAll(async () => {
  await atc('stop', '--force', '--kill')
  rmSync(join(dataFolder, '..'), { recursive: true, force: true })
})

describe(`atc (${command.join(' ')})`, async () => {
  it('reports its version and help', async () => {
    const version = await atc('version', '--json')
    expect(version.code).toBe(0)
    expect(JSON.parse(version.out)).toMatchObject({ atc: expect.any(String), core: CORE_VERSION })
    expect((await atc('--help')).out).toContain('Usage: atc <command>')
    expect((await atc('')).code).toBe(2)
  })

  it('rejects unknown commands and malformed operation inputs', async () => {
    expect((await atc('bogus')).code).toBe(2)
    const stub = await atc('control', 'call', 'api.start', '--input', '[]', '--json')
    expect(stub.code).toBe(2)
    expect(JSON.parse(stub.err)).toMatchObject({ error: { code: 'ATC_USAGE' } })
  })

  it('starts a daemon, serves and stops its public API, then stops the owner', async () => {
    const start = await atc('start', '--admin-port', '0', '--json')
    expect(start.code, start.err).toBe(0)
    expect(JSON.parse(start.out)).toMatchObject({ started: true, running: true, core_version: CORE_VERSION })
    const status = await atc('status', '--json')
    expect(status.code).toBe(0)
    const body = JSON.parse(status.out) as { running: boolean; admin_url: string | null }
    expect(body.running).toBe(true)
    expect(body.admin_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    const admin = await atc('admin', 'status', '--json')
    expect(JSON.parse(admin.out)).toMatchObject({ running: true, admin_url: body.admin_url })
    const operations = await atc('control', 'list', '--json')
    expect(operations.code, operations.err).toBe(0)
    expect(JSON.parse(operations.out).operations).toContainEqual(
      expect.objectContaining({ name: 'models.plan' })
    )
    const manual = await atc('setup', 'manual', '--json')
    expect(manual.code, manual.err).toBe(0)
    const watch = await atc('control', 'watch', '--count', '1')
    expect(watch.code, watch.err).toBe(0)
    expect(JSON.parse(watch.out).snapshot.setup).toMatchObject({ mode: 'manual' })
    const mcp = await runAtcAsync(['mcp', '--data-folder', dataFolder], {
      timeoutMs: 10000,
      input:
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
          { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        ]
          .map((v) => JSON.stringify(v))
          .join('\n') + '\n',
    })
    expect(mcp.code, mcp.err).toBe(0)
    const replies = mcp.out
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(replies.find((r) => r.id === 2).result.tools).toContainEqual(
      expect.objectContaining({ name: 'api_ping' })
    )
    const again = await atc('start', '--json')
    expect(JSON.parse(again.out)).toMatchObject({ started: false })
    expect((await atc('config', 'set', 'api.port', '0')).code).toBe(0)
    const api = await atc('api', 'start', '--json')
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
    expect((await atc('api', 'stop', '--json')).code).toBe(0)
    expect(JSON.parse((await atc('api', 'status', '--json')).out).running).toBe(false)
    expect(JSON.parse((await atc('status', '--json')).out).running).toBe(true)
    const stop = await atc('stop', '--json')
    expect(stop.code, stop.err).toBe(0)
    expect(JSON.parse((await atc('status', '--json')).out)).toMatchObject({ running: false })
  })

  it('replaces a server another build left running: status says so, restart and stop reach it', async (t) => {
    const start = await atc('start', '--no-admin', '--json')
    expect(start.code, start.err).toBe(0)
    // What an update leaves behind: the server's lock names another core version.
    const lockPath = join(dataFolder, 'atomic-core', 'instance.lock')
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Record<string, unknown>
    try {
      writeFileSync(lockPath, JSON.stringify({ ...lock, version: '0.0.1' }))
    } catch (error) {
      // Windows may refuse to write a file the owner holds open; the contract test covers the logic.
      await atc('stop', '--force', '--kill')
      t.skip(`cannot rewrite a held lock here: ${String(error)}`)
    }
    const status = await atc('status', '--json')
    expect(status.code, status.err).toBe(0)
    expect(JSON.parse(status.out)).toMatchObject({ running: true, outdated: true, core_version: '0.0.1' })
    // restart starts with the configured admin port; the default may be taken on a dev machine.
    expect((await atc('config', 'set', 'admin.port', '0')).code).toBe(0)
    const restart = await atc('restart', '--json')
    expect(restart.code, restart.err).toBe(0)
    const after = JSON.parse(restart.out) as { started: boolean; stopped: boolean; instance_id: string }
    expect(after).toMatchObject({ started: true, stopped: true })
    expect(after.instance_id).not.toBe(lock['instance_id'])
    expect(JSON.parse((await atc('status', '--json')).out)).toMatchObject({ running: true })
    expect(JSON.parse((await atc('status', '--json')).out).outdated).toBeUndefined()
    expect((await atc('stop', '--json')).code).toBe(0)
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
      const running = await runAtcAsync(['status', '--json', '--data-folder', folder])
      expect(JSON.parse(running.out)).toMatchObject({ running: true })
      child.kill('SIGTERM')
      expect(await exited).toEqual({ code: 0, signal: null })
      expect(existsSync(join(folder, 'atomic-core', 'instance.lock'))).toBe(false)
    },
    60_000
  )

  it('keeps its own log: `atc logs` shows it, `atc logs -f` follows it live', async () => {
    const folder = join(dataFolder, '..', 'logs')
    const run = (...args: string[]) => runAtcAsync([...args, '--data-folder', folder])
    expect((await run('config', 'set', 'admin.port', '0')).code).toBe(0)
    expect((await run('start', '--json')).code).toBe(0)
    const logs = await run('logs', '--json')
    expect(logs.code).toBe(0)
    expect((JSON.parse(logs.out) as { lines: string[] }).lines.join('\n')).toContain('daemon ready')
    const [exe, ...prefix] = command
    const follower = spawn(exe as string, [...prefix, 'logs', '-f', '-n', '1', '--data-folder', folder], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let seen = ''
    follower.stdout!.on('data', (chunk: Buffer) => (seen += chunk.toString()))
    await new Promise((r) => setTimeout(r, 1000))
    expect((await run('stop')).code).toBe(0)
    const deadline = Date.now() + 10_000
    while (!seen.includes('core stopped') && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 100))
    follower.kill()
    expect(seen).toContain('core stopped')
  }, 60_000)

  it.runIf(process.platform === 'win32')(
    "keeps atc's folder to this user on Windows, even outside the profile",
    async () => {
      // Inside the checkout the folder would inherit BUILTIN\\Users from the drive.
      const folder = join(ROOT, '.e2e-acl', 'data')
      try {
        const run = (...args: string[]) => runAtcAsync([...args, '--data-folder', folder])
        expect((await run('config', 'set', 'admin.port', '0')).code).toBe(0)
        expect((await run('start', '--no-admin')).code).toBe(0)
        const icacls = (...path: string[]) => runProcess('icacls', [join(folder, 'atc', ...path)])
        const acl = (await icacls('client-keys.json')).out
        // Where the open entry comes from (the folder, or only this file), and what the server logged.
        const why = async () =>
          [
            acl,
            (await icacls()).out,
            (await icacls('config.json')).out,
            (await icacls('logs')).out,
            (await run('logs', '-n', '50')).out,
          ].join('\n')
        expect(acl, await why()).not.toMatch(/BUILTIN\\Users|Everyone|Authenticated Users/i)
        expect(acl.toLowerCase()).toContain((process.env['USERNAME'] ?? '').toLowerCase())
        // The server accepted the folder, and the core's executor would trust it as well. The server
        // reads the folder back after it started (a cold PowerShell takes seconds), so wait for it.
        let log = ''
        for (const deadline = Date.now() + 90_000; Date.now() < deadline;) {
          log = (await run('logs', '-n', '50')).out
          if (/restricted .+ to this user|could not restrict/.test(log)) break
          await new Promise((r) => setTimeout(r, 500))
        }
        expect(log, await why()).toMatch(/restricted .+ to this user/)
        expect(log, await why()).not.toContain('could not restrict')
        const dir = join(folder, 'atc')
        const read = await readWindowsAcl(dir, {
          exec: async (exe, args, options) => {
            const r = await runProcess(exe, args, { env: overlayWindowsEnv(process.env, options?.env) })
            return { code: r.code, stdout: r.out, stderr: r.err }
          },
        })
        expect(judgeWindowsAcl(read, dir, 'directory'), JSON.stringify(read)).toBeNull()
      } finally {
        await runAtcAsync(['stop', '--force', '--kill', '--data-folder', folder])
        rmSync(join(ROOT, '.e2e-acl'), { recursive: true, force: true })
      }
    },
    180_000
  )

  it('prints a completion script', async () => {
    const bash = await atc('completion', 'bash')
    expect(bash.code).toBe(0)
    expect(bash.out).toContain('complete -F _atc atc')
  })
})
