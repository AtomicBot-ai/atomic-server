/**
 * `atc service` against a recording service manager (the per-platform steps are unit-tested in
 * `src/host/service-plans.test.ts`), and `atc start --foreground` against a real core.
 */
import { existsSync } from 'node:fs'
import { inspectLock } from '@atomic-chat/core/host'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AtcError } from '../../src/errors/index.js'
import type { ServiceManager, ServiceOptions, ServiceState } from '../../src/host/index.js'
import { hostFacts } from '../../src/host/index.js'
import { recordingIo } from '../../src/io.js'
import { runCli } from '../../src/main.js'
import { fakeHost, testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

function recordingManager(kind: ServiceManager['kind'] = 'systemd') {
  const calls: Array<[string, ServiceOptions]> = []
  let installed = false
  const state = (): ServiceState => ({ installed, running: installed, definition: '/units/atc.service' })
  const manager: ServiceManager = {
    kind,
    install: async (o) => void (calls.push(['install', o]), (installed = true)),
    uninstall: async (o) => void (calls.push(['uninstall', o]), (installed = false)),
    status: async () => state(),
    start: async (o) => void calls.push(['start', o]),
    stop: async (o) => void calls.push(['stop', o]),
    restart: async (o) => void calls.push(['restart', o]),
  }
  return { manager, calls }
}

const facts = (over: { platform?: NodeJS.Platform; euid?: number; elevated?: boolean } = {}) =>
  hostFacts({
    platform: over.platform ?? 'linux',
    arch: 'x64',
    env: {},
    hasTty: false,
    euid: over.euid ?? 1000,
    username: 'alice',
    homedir: '/home/alice',
    hostname: 'h',
    onPath: () => true,
    ...(over.elevated !== undefined ? { isElevatedWindows: over.elevated } : {}),
  })

let t: TestRun | undefined
afterEach(() => t?.cleanup())

function run(
  options: { kind?: ServiceManager['kind']; facts?: ReturnType<typeof facts>; running?: boolean } = {}
) {
  const { manager, calls } = recordingManager(options.kind)
  t = testRun({
    running: options.running ?? false,
    deps: {
      host: fakeHost({ services: manager, facts: options.facts ?? facts(), selfCommand: ['/opt/atc'] }),
    },
  })
  const exec = async (argv: string[]) => {
    t!.io.out.length = 0
    t!.io.err.length = 0
    const code = await t!.run([...argv, '--json'])
    return {
      code,
      doc: t!.io.out.length ? JSON.parse(t!.io.out.join('')) : undefined,
      err: t!.io.err.join(''),
    }
  }
  return { exec, calls, link: t.link, paths: () => t!.io.env['ATC_DATA_FOLDER'] }
}

describe('atc service', () => {
  it('installs a user service for this data folder and binary, and reports it', async () => {
    const s = run()
    const r = await s.exec(['service', 'install'])
    expect(r.code, r.err).toBe(0)
    expect(r.doc).toMatchObject({ installed: true, manager: 'systemd', name: 'atc', system: false })
    expect(s.calls).toHaveLength(1)
    const [action, o] = s.calls[0]!
    expect(action).toBe('install')
    expect(o).toMatchObject({ command: ['/opt/atc'], dataFolder: s.paths(), system: false, user: 'alice' })
    expect(o.logFile).toMatch(/atc[/\\]logs[/\\]service\.log$/)
  })

  it('stops a server started by hand before installing, so the service can own the folder', async () => {
    const s = run({ running: true })
    expect((await s.exec(['service', 'install'])).code).toBe(0)
    expect(s.link.shutdowns).toBe(1)
  })

  it.each([
    ['linux', { euid: 1000 }, 'sudo atc service install --system --user alice'],
    ['win32', { platform: 'win32' as const, elevated: false }, 'elevated PowerShell'],
  ] as const)('refuses --system without administrator rights on %s', async (_p, over, hint) => {
    const s = run({ facts: facts(over) })
    const r = await s.exec(['service', 'install', '--system'])
    expect(r.code).toBe(1)
    expect(JSON.parse(r.err)).toMatchObject({ error: { code: 'ATC_ELEVATION_REQUIRED' } })
    expect(r.err).toContain(hint)
    expect(s.calls).toEqual([])
  })

  it('installs --system as root, running as --user', async () => {
    const s = run({ facts: facts({ euid: 0 }) })
    const r = await s.exec(['service', 'install', '--system', '--user', 'svc'])
    expect(r.code, r.err).toBe(0)
    expect(r.doc).toMatchObject({ system: true, user: 'svc' })
    expect(s.calls[0]![1]).toMatchObject({ system: true, user: 'svc' })
  })

  it('rejects a name a unit file or task could not carry', async () => {
    const s = run()
    expect((await s.exec(['service', 'install', '--name', '../evil'])).code).toBe(2)
  })

  it('needs an installed service to start, stop or remove', async () => {
    const s = run()
    for (const action of ['start', 'stop', 'restart', 'uninstall']) {
      const r = await s.exec(['service', action])
      expect(r.code).toBe(1)
      expect(JSON.parse(r.err)).toMatchObject({ error: { code: 'ATC_SERVICE_NOT_INSTALLED' } })
    }
    expect(s.calls).toEqual([])
  })

  it.each(['start', 'stop', 'restart', 'uninstall'])(
    'keeps an absent service local when %s is refused, including a custom name',
    async (action) => {
      const request = vi.fn<typeof fetch>(async () => new Response('{}'))
      const { manager, calls } = recordingManager('task')
      t = testRun({
        running: true,
        io: {
          env: { ATC_SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/42' },
          fetch: request,
        },
        deps: { host: fakeHost({ services: manager, facts: facts({ platform: 'win32' }) }) },
      })
      expect(await t.run(['service', action, '--name', 'custom', '--json'])).toBe(1)
      expect(JSON.parse(t.io.err.join(''))).toMatchObject({
        error: {
          code: 'ATC_SERVICE_NOT_INSTALLED',
          message: 'The service "custom" is not installed.',
          hint: expect.stringContaining('--name custom'),
        },
      })
      expect(request).not.toHaveBeenCalled()
      expect(calls).toEqual([])
      expect(t.link.shutdowns).toBe(0)
    }
  )

  it.each(['status', 'start', 'stop', 'restart', 'uninstall'])(
    'reports a failed status query during %s without controlling the service',
    async (action) => {
      const request = vi.fn<typeof fetch>(async () => new Response('{}'))
      const { manager, calls } = recordingManager('task')
      manager.status = async () => {
        throw new AtcError('ATC_SERVICE_FAILED', 'Cannot query task.')
      }
      t = testRun({
        running: true,
        io: {
          env: { ATC_SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/42' },
          fetch: request,
        },
        deps: { host: fakeHost({ services: manager, facts: facts({ platform: 'win32' }) }) },
      })
      expect(await t.run(['service', action, '--json'])).toBe(1)
      expect(JSON.parse(t.io.err.join(''))).toMatchObject({ error: { code: 'ATC_SERVICE_FAILED' } })
      expect(request).toHaveBeenCalledTimes(1)
      expect(calls).toEqual([])
      expect(t.link.shutdowns).toBe(0)
    }
  )

  it('reports status, controls the installed service and removes it', async () => {
    const s = run()
    await s.exec(['service', 'install'])
    expect((await s.exec(['service', 'status'])).doc).toMatchObject({
      installed: true,
      running: true,
      manager: 'systemd',
      definition: '/units/atc.service',
    })
    for (const action of ['stop', 'start', 'restart', 'uninstall'])
      expect((await s.exec(['service', action])).code).toBe(0)
    expect(s.calls.map(([a]) => a)).toEqual(['install', 'stop', 'start', 'restart', 'uninstall'])
  })

  it('stops the server through its API before ending a Windows task, which has no signal', async () => {
    const s = run({ kind: 'task', facts: facts({ platform: 'win32' }), running: true })
    await s.exec(['service', 'install'])
    s.link.shutdowns = 0
    expect((await s.exec(['service', 'stop'])).code).toBe(0)
    expect(s.link.shutdowns).toBe(1)
    expect(s.calls.map(([a]) => a)).toEqual(['install', 'stop'])
  })

  it('leaves the stop to the signal on systemd', async () => {
    const s = run({ running: true })
    await s.exec(['service', 'install'])
    s.link.shutdowns = 0
    expect((await s.exec(['service', 'stop'])).code).toBe(0)
    expect(s.link.shutdowns).toBe(0)
  })
})

describe('atc start --foreground', () => {
  it('runs a real server in this process and cleans up when it is told to stop', async () => {
    const { paths, cleanup } = tmpDataFolder('atc-fg-')
    try {
      // recordingIo answers `waitForShutdown` at once: the server starts, then stops like on SIGTERM.
      const io = recordingIo()
      const code = await runCli(['start', '--foreground', '--no-admin'], io, { paths, host: fakeHost() })
      expect(code, io.err.join('')).toBe(0)
      expect(existsSync(paths.daemonRecord)).toBe(false)
      expect((await inspectLock(paths.layout)).kind).toBe('free')
    } finally {
      cleanup()
    }
  }, 60_000)

  it('refuses while a server of this build runs for the folder', async () => {
    const s = run({ running: true })
    const r = await s.exec(['start', '--foreground'])
    expect(r.code).toBe(1)
    expect(JSON.parse(r.err)).toMatchObject({ error: { code: 'ATC_DAEMON_ALREADY_RUNNING' } })
  })
})
