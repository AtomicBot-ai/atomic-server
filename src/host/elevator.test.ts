import { describe, expect, it } from 'vitest'
import {
  createElevator,
  elevatedCommand,
  manualInstructions,
  selectStrategy,
  wasDeclined,
} from './elevator.js'
import type { ElevationContext } from './elevator.js'

const linux: ElevationContext = {
  platform: 'linux',
  isRoot: false,
  isElevatedWindows: null,
  hasTty: false,
  hasDisplay: false,
  hasPkexec: false,
  hasSudo: true,
  inDaemon: true,
}

describe('selectStrategy', () => {
  it.each<[string, Partial<ElevationContext>, string]>([
    ['root wins everywhere', { isRoot: true }, 'root'],
    ['headless daemon falls back to manual', {}, 'manual'],
    ['desktop daemon uses pkexec', { hasDisplay: true, hasPkexec: true }, 'pkexec'],
    ['a command on a terminal uses sudo', { inDaemon: false, hasTty: true }, 'sudo-tty'],
    ['a command without sudo is manual', { inDaemon: false, hasTty: true, hasSudo: false }, 'manual'],
    ['a command without a terminal is manual', { inDaemon: false, hasTty: false }, 'manual'],
    ['elevated windows is root', { platform: 'win32', isElevatedWindows: true }, 'root'],
    ['windows daemon asks UAC', { platform: 'win32', isElevatedWindows: false }, 'windows-runas'],
    [
      'windows command without terminal is manual',
      { platform: 'win32', isElevatedWindows: false, inDaemon: false },
      'manual',
    ],
  ])('%s', (_name, over, expected) => {
    expect(selectStrategy({ ...linux, ...over })).toBe(expected)
  })
})

describe('createElevator', () => {
  it('runs the helper as root and reads its result file', async () => {
    const calls: string[][] = []
    const elevator = createElevator(
      {
        exec: async (cmd, args) => {
          calls.push([cmd, ...args])
          return { code: 0, stdout: '', stderr: '', timedOut: false }
        },
        selfCommand: ['/bin/atc'],
        readResult: async () => ({
          schema_version: 1,
          step_id: 's',
          outcome: 'completed',
          exit_code: 0,
          log_tail: '',
          finished_at: 1,
        }),
      },
      'linux'
    )
    const outcome = await elevator.run('root', '/tmp/s.request.json')
    expect(calls).toEqual([['/bin/atc', 'host-step', 'exec', '/tmp/s.request.json']])
    expect(outcome).toMatchObject({ kind: 'result', result: { outcome: 'completed' } })
  })

  it('hands back instructions for manual', async () => {
    const elevator = createElevator(
      {
        exec: async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }),
        selfCommand: ['/bin/atc'],
        readResult: async () => undefined,
      },
      'linux'
    )
    expect(await elevator.run('manual', '/tmp/s.request.json')).toEqual({
      kind: 'pending',
      instructions: "sudo '/bin/atc' host-step exec '/tmp/s.request.json'",
    })
    expect(manualInstructions(['C:\\atc.exe'], 'C:\\r j.json', 'win32')).toContain('Administrator')
  })

  it('quotes a manual command so the shell cannot expand it', () => {
    expect(manualInstructions(['/bin/atc'], '/tmp/a$(whoami) b', 'linux')).toBe(
      "sudo '/bin/atc' host-step exec '/tmp/a$(whoami) b'"
    )
    expect(manualInstructions(['/bin/atc'], "/tmp/a'b", 'linux')).toBe(
      "sudo '/bin/atc' host-step exec '/tmp/a'\\''b'"
    )
    expect(manualInstructions(['C:\\atc.exe'], 'C:\\a b', 'win32')).toContain("'C:\\a b'")
  })

  it.each([
    ['sudo-tty', ['sudo', '-k', '--', '/bin/atc', 'host-step', 'exec', '/s.request.json'], 'inherit'],
    ['pkexec', ['pkexec', '/bin/atc', 'host-step', 'exec', '/s.request.json'], undefined],
    ['root', ['/bin/atc', 'host-step', 'exec', '/s.request.json'], 'inherit'],
  ] as const)('runs %s as %j', async (strategy, argv, stdio) => {
    const calls: Array<{ argv: string[]; stdio?: string; env?: NodeJS.ProcessEnv }> = []
    const elevator = createElevator(
      {
        exec: async (cmd, args, options) => {
          calls.push({
            argv: [cmd, ...args],
            ...(options?.stdio ? { stdio: options.stdio } : {}),
            ...(options?.env ? { env: options.env } : {}),
          })
          return { code: 0, stdout: '', stderr: '', timedOut: false }
        },
        selfCommand: ['/bin/atc'],
        readResult: async () => ({
          schema_version: 1,
          step_id: 's',
          outcome: 'completed',
          exit_code: 0,
          log_tail: '',
          finished_at: 1,
        }),
        env: { SUDO_UID: '501', PKEXEC_UID: '501', PATH: '/bin' },
      },
      'linux'
    )
    expect(await elevator.run(strategy, '/s.request.json')).toMatchObject({
      kind: 'result',
      result: { outcome: 'completed' },
    })
    expect(calls[0]?.argv).toEqual(argv)
    expect(calls[0]?.stdio).toBe(stdio)
    // Root clears the invoking user, so the executor trusts the folder root itself created.
    if (strategy === 'root') expect(calls[0]?.env).toEqual({ PATH: '/bin' })
  })

  it('asks UAC through Start-Process -Verb RunAs on Windows, quoting the arguments', () => {
    const line = elevatedCommand(
      'windows-runas',
      ['C:\\Program Files\\atc\\atc.exe'],
      "C:\\Users\\o'b\\s.request.json",
      {}
    )
    expect(line.command).toBe('powershell.exe')
    expect(line.args.at(-1)).toBe(
      "$p = Start-Process -FilePath 'C:\\Program Files\\atc\\atc.exe' -ArgumentList @('host-step','exec','C:\\Users\\o''b\\s.request.json') -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode"
    )
  })

  it.each([
    ['pkexec', 126, '', 'declined'],
    ['pkexec', 127, 'not authorized', 'failed'],
    ['windows-runas', 1, 'This operation was canceled by the user.', 'declined'],
    ['sudo-tty', 1, 'sudo: 3 incorrect password attempts', 'declined'],
    ['root', 1, 'boom', 'failed'],
  ] as const)('without a result file, %s exit %i is %s', async (strategy, code, stderr, outcome) => {
    const elevator = createElevator(
      {
        exec: async () => ({ code, stdout: '', stderr, timedOut: false }),
        selfCommand: ['/bin/atc'],
        readResult: async () => undefined,
      },
      'linux'
    )
    expect(await elevator.run(strategy, '/r.json')).toMatchObject({
      kind: 'result',
      result: { outcome, exit_code: code },
    })
    expect(wasDeclined(strategy, code, stderr)).toBe(outcome === 'declined')
  })
})
