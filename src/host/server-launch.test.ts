import { describe, expect, it } from 'vitest'
import { serverLaunch, serviceUnit } from './server-launch.js'

describe('serverLaunch', () => {
  const user = '0::/user.slice/user-1000.slice/user@1000.service/app.slice/atc.service\n'
  const system = '0::/system.slice/atc.service\n'
  it.each([
    ['a server started from a terminal', { platform: 'linux', env: {} }, 'terminal'],
    [
      'a systemd --user unit',
      { platform: 'linux', env: { INVOCATION_ID: 'x' }, cgroup: user },
      'systemd-user',
    ],
    ['a system unit', { platform: 'linux', env: { INVOCATION_ID: 'x' }, cgroup: system }, 'systemd-system'],
    [
      'a system unit whose cgroup could not be read',
      { platform: 'linux', env: { INVOCATION_ID: 'x' } },
      'systemd-system',
    ],
    ['a launchd job', { platform: 'darwin', env: { XPC_SERVICE_NAME: 'ai.atomicbot.atc' } }, 'launchd'],
    ['Terminal.app on macOS', { platform: 'darwin', env: { XPC_SERVICE_NAME: '0' } }, 'terminal'],
    ['Windows', { platform: 'win32', env: { INVOCATION_ID: 'x' } }, 'terminal'],
  ] as const)('%s', (_name, facts, launch) => {
    expect(serverLaunch(facts)).toBe(launch)
  })
})

describe('serviceUnit', () => {
  it.each([
    [
      'a systemd --user unit',
      '0::/user.slice/user-1000.slice/user@1000.service/app.slice/atc.service\n',
      'atc',
    ],
    ['a system unit installed with --name', '0::/system.slice/atomic.service\n', 'atomic'],
    [
      'a system unit under cgroup v1',
      '12:pids:/system.slice/atomic.service\n1:name=systemd:/system.slice/atomic.service\n',
      'atomic',
    ],
    ['a login session', '0::/user.slice/user-1000.slice/session-3.scope\n', undefined],
    ['no cgroup', undefined, undefined],
  ] as const)('%s', (_name, cgroup, unit) => {
    expect(serviceUnit(cgroup)).toBe(unit)
  })
})
