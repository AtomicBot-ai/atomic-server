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
import { runAtc } from '../helpers/binary.js'

const enabled = process.env['ATC_E2E_SERVICE'] === '1'
const root = mkdtempSync(join(tmpdir(), 'atc-service-'))
const dataFolder = join(root, 'data')
const system = process.platform === 'linux'
const scope = [...(system ? ['--system', '--user', userInfo().username] : []), '--name', 'atc-e2e']
const sudo = system

const atc = (...args: string[]) => runAtc([...args, '--data-folder', dataFolder, '--json'])
const service = (...args: string[]) =>
  runAtc(['service', ...args, ...scope, '--data-folder', dataFolder, '--json'], { sudo })

async function until<T>(read: () => T | undefined, timeoutMs: number): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = read()
    if (value !== undefined || Date.now() > deadline) return value
    await new Promise((r) => setTimeout(r, 500))
  }
}

const serverPid = (): number | undefined => {
  const r = atc('status')
  const doc = r.code === 0 ? (JSON.parse(r.out) as { running: boolean; pid?: number }) : undefined
  return doc?.running ? doc.pid : undefined
}

afterAll(() => {
  if (!enabled) return
  service('uninstall')
  atc('stop', '--force', '--kill')
  rmSync(root, { recursive: true, force: true })
})

describe.runIf(enabled)(`atc service under the OS service manager (${process.platform})`, () => {
  it('installs, restarts the server after a crash, keeps it stopped after `atc stop`, uninstalls', async () => {
    // A server started by hand first: install must take it over.
    expect(atc('config', 'set', 'admin.port', '0').code).toBe(0)
    expect(atc('start').code).toBe(0)
    const install = service('install')
    expect(install.code, install.err).toBe(0)
    expect(JSON.parse(install.out)).toMatchObject({ installed: true, name: 'atc-e2e' })

    const first = await until(serverPid, 60_000)
    expect(first, 'the service did not start the server').toBeDefined()
    expect(JSON.parse(service('status').out)).toMatchObject({ installed: true, running: true })

    // A crash: the manager brings it back (systemd after 5 s, launchd after 5 s, a task after 1 min).
    process.kill(first!, 'SIGKILL')
    const second = await until(() => {
      const pid = serverPid()
      return pid !== undefined && pid !== first ? pid : undefined
    }, 120_000)
    expect(second, 'the service did not restart the server after a crash').toBeDefined()

    // `atc stop` exits 0: the manager must not start it again.
    expect(atc('stop', '--force').code).toBe(0)
    await new Promise((r) => setTimeout(r, 10_000))
    expect(serverPid()).toBeUndefined()

    expect(service('start').code).toBe(0)
    expect(await until(serverPid, 60_000)).toBeDefined()

    const uninstall = service('uninstall')
    expect(uninstall.code, uninstall.err).toBe(0)
    expect(JSON.parse(service('status').out)).toMatchObject({ installed: false })
    expect(await until(() => (serverPid() === undefined ? true : undefined), 30_000)).toBe(true)
  }, 360_000)
})
