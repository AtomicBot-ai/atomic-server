/**
 * The server under the real service manager of this OS: install, survive a crash, stay stopped after
 * `atc stop`, uninstall. It changes the machine (a systemd unit, a LaunchAgent, a scheduled task), so
 * it runs only with `ATC_E2E_SERVICE=1` — on CI runners, never on a developer's machine by accident.
 * Linux installs system-wide with passwordless `sudo` (CI has no user systemd session); macOS and
 * Windows install for the current user.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runAtcAsync as runAtc, runProcess } from '../helpers/async-binary.js'
import type { AtcResult } from '../helpers/binary.js'

const enabled = process.env['ATC_E2E_SERVICE'] === '1'
const root = mkdtempSync(join(tmpdir(), 'atc-service-'))
const dataFolder = join(root, 'data')
const system = process.platform === 'linux'
const scope = [...(system ? ['--system'] : []), '--name', 'atc-e2e']
// Only `install` takes --user (the account a system service runs as); the others find it by name.
const runAs = system ? ['--user', userInfo().username] : []
const sudo = system

const atc = (...args: string[]) => runAtc([...args, '--data-folder', dataFolder, '--json'])
const service = (...args: string[]) =>
  runAtc(['service', ...args, ...scope, '--data-folder', dataFolder, '--json'], { sudo })

/** The JSON document of a command that must succeed; its stderr says why when it did not. */
function doc(r: AtcResult): unknown {
  expect(r.code, r.err).toBe(0)
  return JSON.parse(r.out)
}

async function until<T>(read: () => Promise<T | undefined>, timeoutMs: number): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (value !== undefined || Date.now() > deadline) return value
    await new Promise((r) => setTimeout(r, 500))
  }
}

const serverPid = async (): Promise<number | undefined> => {
  const r = await atc('status')
  const doc = r.code === 0 ? (JSON.parse(r.out) as { running: boolean; pid?: number }) : undefined
  return doc?.running ? doc.pid : undefined
}

afterAll(async () => {
  if (!enabled) return
  await service('uninstall')
  await atc('stop', '--force', '--kill')
  rmSync(root, { recursive: true, force: true })
})

describe.runIf(enabled)(`atc service under the OS service manager (${process.platform})`, () => {
  it('installs, restarts the server after a crash, keeps it stopped after `atc stop`, uninstalls', async () => {
    // A server started by hand first: install must take it over.
    expect((await atc('config', 'set', 'admin.port', '0')).code).toBe(0)
    expect((await atc('start')).code).toBe(0)
    expect(doc(await service('install', ...runAs))).toMatchObject({ installed: true, name: 'atc-e2e' })

    const first = await until(serverPid, 60_000)
    expect(first, 'the service did not start the server').toBeDefined()
    expect(doc(await service('status'))).toMatchObject({ installed: true, running: true })

    // A crash: the manager brings it back (systemd after 5 s, launchd after 5 s, a task after 1 min).
    process.kill(first!, 'SIGKILL')
    const second = await until(async () => {
      const pid = await serverPid()
      return pid !== undefined && pid !== first ? pid : undefined
    }, 120_000)
    if (second === undefined) {
      console.error('server log after crash:', await atc('logs', '-n', '100'))
      if (process.platform === 'win32') {
        const task = await runProcess('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$s = New-Object -ComObject Schedule.Service; $s.Connect(); ' +
            "$t = $s.GetFolder('\\').GetTask('atc-e2e'); " +
            '[pscustomobject]@{State=$t.State;LastTaskResult=$t.LastTaskResult;' +
            "LastRunTime=$t.LastRunTime.ToString('o');Xml=$t.Xml} | ConvertTo-Json -Depth 4",
        ])
        console.error('Task Scheduler after crash:', task)
      }
    }
    expect(second, 'the service did not restart the server after a crash').toBeDefined()

    // `atc stop` exits 0: the manager must not start it again.
    expect((await atc('stop', '--force')).code).toBe(0)
    await new Promise((r) => setTimeout(r, 10_000))
    expect(await serverPid()).toBeUndefined()

    expect(doc(await service('start'))).toMatchObject({ started: true })
    expect(await until(serverPid, 60_000)).toBeDefined()

    expect(doc(await service('uninstall'))).toMatchObject({ uninstalled: true })
    expect(doc(await service('status'))).toMatchObject({ installed: false })
    expect(await until(async () => ((await serverPid()) === undefined ? true : undefined), 30_000)).toBe(true)
  }, 360_000)
})
