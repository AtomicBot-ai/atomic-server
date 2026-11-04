import { describe, expect, it } from 'vitest'
import { spawnTarget } from './spawn-target.js'

describe('spawnTarget', () => {
  it.each([
    ['an executable on Windows', 'C:\\bin\\codex.exe', 'win32'],
    ['a shim name elsewhere', '/usr/local/bin/codex.cmd', 'linux'],
    ['a POSIX launcher', '/usr/local/bin/claude', 'darwin'],
  ] as const)('spawns %s directly', (_name, program, platform) => {
    expect(spawnTarget(program, ['--model', 'm'], platform)).toEqual({
      file: program,
      args: ['--model', 'm'],
      windowsVerbatimArguments: false,
    })
  })

  it('runs a .cmd or .bat shim through cmd.exe, quoting what cmd would split', () => {
    expect(
      spawnTarget(
        'C:\\Program Files\\nodejs\\claude.CMD',
        ['--settings', 'C:\\Users\\Ann Lee\\settings.json', '-c', 'a="b"'],
        'win32'
      )
    ).toEqual({
      file: 'cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        '""C:\\Program Files\\nodejs\\claude.CMD" --settings "C:\\Users\\Ann Lee\\settings.json" -c "a=""b""""',
      ],
      windowsVerbatimArguments: true,
    })
    expect(spawnTarget('C:\\npm\\codex.bat', [], 'win32').file).toBe('cmd.exe')
  })
})
