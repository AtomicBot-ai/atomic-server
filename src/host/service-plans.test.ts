import { describe, expect, it } from 'vitest'
import type { ExecResult } from './exec.js'
import type { ServiceOptions } from './service-manager.js'
import {
  controlPlan,
  createServiceManager,
  installPlan,
  runServiceSteps,
  statusProbe,
  uninstallPlan,
} from './service-plans.js'
import type { ServiceFiles, ServiceStep } from './service-plans.js'

const o: ServiceOptions = {
  name: 'atc',
  command: ['/bin/atc'],
  dataFolder: '/d',
  system: false,
  user: 'u',
  logFile: '/d/atc/logs/service.log',
}
const env = { home: '/home/u', uid: 501, windowsUser: 'H\\u' }

/** The steps as one readable line each. */
const lines = (steps: ServiceStep[]) =>
  steps.map((s) =>
    s.kind === 'exec'
      ? `${s.command} ${s.args.join(' ')}${s.ignoreFailure ? ' (may fail)' : ''}`
      : `${s.kind} ${s.path}`
  )

describe('install, uninstall and control plans', () => {
  it.each([
    [
      'linux',
      false,
      [
        'write /home/u/.config/systemd/user/atc.service',
        'systemctl --user daemon-reload',
        'systemctl --user enable --now atc.service',
      ],
    ],
    [
      'linux',
      true,
      [
        'write /etc/systemd/system/atc.service',
        'systemctl daemon-reload',
        'systemctl enable --now atc.service',
      ],
    ],
    [
      'darwin',
      false,
      [
        'write /home/u/Library/LaunchAgents/ai.atomic.atc.plist',
        'launchctl bootout gui/501/ai.atomic.atc (may fail)',
        'launchctl bootstrap gui/501 /home/u/Library/LaunchAgents/ai.atomic.atc.plist',
      ],
    ],
    [
      'darwin',
      true,
      [
        'write /Library/LaunchDaemons/ai.atomic.atc.plist',
        'launchctl bootout system/ai.atomic.atc (may fail)',
        'launchctl bootstrap system /Library/LaunchDaemons/ai.atomic.atc.plist',
      ],
    ],
    [
      'win32',
      false,
      [
        'write /d/atc/run/atc.task.xml',
        'schtasks /Create /F /TN atc /XML /d/atc/run/atc.task.xml',
        'remove /d/atc/run/atc.task.xml',
        'schtasks /Run /TN atc',
      ],
    ],
  ] as const)('install on %s (system=%s)', (platform, system, expected) => {
    expect(lines(installPlan(platform, { ...o, system }, env))).toEqual(expected)
  })

  it('writes the task XML as UTF-16 with a byte-order mark', () => {
    const write = installPlan('win32', o, env)[0]
    expect(write).toMatchObject({ kind: 'write', encoding: 'utf16le' })
    expect(write?.kind === 'write' && write.content.startsWith('\ufeff<?xml')).toBe(true)
  })

  it.each([
    [
      'linux',
      [
        'systemctl --user disable --now atc.service (may fail)',
        'remove /home/u/.config/systemd/user/atc.service',
        'systemctl --user daemon-reload',
      ],
    ],
    [
      'darwin',
      [
        'launchctl bootout gui/501/ai.atomic.atc (may fail)',
        'remove /home/u/Library/LaunchAgents/ai.atomic.atc.plist',
      ],
    ],
    ['win32', ['schtasks /End /TN atc (may fail)', 'schtasks /Delete /F /TN atc']],
  ] as const)('uninstall on %s', (platform, expected) => {
    expect(lines(uninstallPlan(platform, o, env))).toEqual(expected)
  })

  it.each([
    ['linux', 'start', ['systemctl --user start atc.service']],
    ['linux', 'stop', ['systemctl --user stop atc.service']],
    ['linux', 'restart', ['systemctl --user restart atc.service']],
    ['darwin', 'start', ['launchctl kickstart gui/501/ai.atomic.atc']],
    ['darwin', 'stop', ['launchctl kill SIGTERM gui/501/ai.atomic.atc (may fail)']],
    ['darwin', 'restart', ['launchctl kickstart -k gui/501/ai.atomic.atc']],
    ['win32', 'start', ['schtasks /Run /TN atc']],
    ['win32', 'stop', ['schtasks /End /TN atc (may fail)']],
    ['win32', 'restart', ['schtasks /End /TN atc (may fail)', 'schtasks /Run /TN atc']],
  ] as const)('%s %s', (platform, action, expected) => {
    expect(lines(controlPlan(platform, o, env, action))).toEqual(expected)
  })
})

const result = (over: Partial<ExecResult>): ExecResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
})

describe('status probes', () => {
  it.each([
    ['linux', result({ stdout: 'active\n' }), true],
    ['linux', result({ code: 3, stdout: 'inactive\n' }), false],
    ['linux', result({ error: 'ENOENT' }), null],
    ['darwin', result({ stdout: 'gui/501/ai.atomic.atc = {\n\tstate = running\n' }), true],
    ['darwin', result({ stdout: '\tstate = not running\n' }), false],
    ['win32', result({ stdout: '4\r\n' }), true],
    ['win32', result({ stdout: '3\r\n' }), false],
    ['win32', result({ stdout: '0\r\n' }), null],
  ] as const)('%s reads %j as running=%s', (platform, r, running) => {
    expect(statusProbe(platform, o, env).running(r)).toBe(running)
  })
})

function fakes(results: Record<string, ExecResult> = {}) {
  const calls: string[] = []
  const written = new Map<string, string>()
  const files: ServiceFiles = {
    write: async (path, content) => void written.set(path, content),
    remove: async (path) => void written.delete(path),
    exists: async (path) => written.has(path),
  }
  const exec = async (command: string, args: readonly string[]) => {
    const line = `${command} ${args.join(' ')}`
    calls.push(line)
    return results[line] ?? result({})
  }
  return { calls, written, files, exec }
}

describe('the runner', () => {
  it('stops at the first failing command and names it, but tolerates the optional ones', async () => {
    const f = fakes({
      'launchctl bootout gui/501/ai.atomic.atc': result({ code: 3, stderr: 'no such job' }),
      'launchctl bootstrap gui/501 /home/u/Library/LaunchAgents/ai.atomic.atc.plist': result({
        code: 5,
        stderr: 'Bootstrap failed: 5: Input/output error',
      }),
    })
    await expect(
      runServiceSteps(installPlan('darwin', o, env), { platform: 'darwin', env, ...f })
    ).rejects.toMatchObject({
      code: 'ATC_SERVICE_FAILED',
      details: 'Bootstrap failed: 5: Input/output error',
    })
    expect(f.calls).toHaveLength(2)
  })

  it('reports an installed, running systemd unit, and one that is absent', async () => {
    const f = fakes({ 'systemctl --user is-active atc.service': result({ stdout: 'active\n' }) })
    const manager = createServiceManager({ platform: 'linux', env, ...f })
    expect(manager.kind).toBe('systemd')
    expect(await manager.status(o)).toEqual({
      installed: false,
      running: false,
      definition: '/home/u/.config/systemd/user/atc.service',
    })
    await manager.install(o)
    expect(f.written.get('/home/u/.config/systemd/user/atc.service')).toContain('ExecStart=/bin/atc start')
    expect(await manager.status(o)).toMatchObject({ installed: true, running: true })
    await manager.uninstall(o)
    expect(f.written.size).toBe(0)
  })

  it('knows a Windows task is installed from the query, not from a file', async () => {
    const manager = createServiceManager({
      platform: 'win32',
      env,
      ...fakes(),
      exec: async () => result({ stdout: 'missing\r\n' }),
    })
    expect(await manager.status(o)).toEqual({ installed: false, running: false, definition: 'schtasks:atc' })
  })

  it.each([
    ['access denied', result({ code: 1, stderr: 'Access is denied. (0x80070005)' })],
    ['spawn failure', result({ code: null, error: 'ENOENT' })],
    ['timeout', result({ code: null, timedOut: true })],
    ['partial output before failure', result({ code: 1, stdout: 'missing\n' })],
    ['malformed response', result({ stdout: 'unexpected' })],
  ])('does not call a Windows task absent on %s', async (_name, response) => {
    const manager = createServiceManager({
      platform: 'win32',
      env,
      ...fakes(),
      exec: async () => response,
    })
    await expect(manager.status(o)).rejects.toMatchObject({ code: 'ATC_SERVICE_FAILED' })
  })
})
