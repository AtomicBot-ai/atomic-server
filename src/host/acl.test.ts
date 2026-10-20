import { judgeWindowsAcl } from '@atomic-chat/core/host'
import type { WindowsAcl } from '@atomic-chat/core/host'
import { describe, expect, it } from 'vitest'
import { icaclsPath, ownerOnlyAclArgs, restrictToOwner, windowsPowerShellEnv } from './acl.js'
import type { ExecFn } from './exec.js'

describe('owner-only folder ACL', () => {
  it('removes inherited entries and grants this user, SYSTEM and Administrators by SID', () => {
    expect(ownerOnlyAclArgs('C:\\atc data\\atc', 'HOST\\alice')).toEqual([
      'C:\\atc data\\atc',
      '/inheritance:r',
      '/grant:r',
      '*S-1-5-18:(OI)(CI)F',
      '/grant:r',
      '*S-1-5-32-544:(OI)(CI)F',
      '/grant:r',
      'HOST\\alice:(OI)(CI)F',
    ])
  })

  it('runs icacls only on Windows and reports a failure instead of throwing', async () => {
    const calls: string[] = []
    const exec = async (command: string, args: readonly string[]) => {
      calls.push(`${command} ${args[0]}`)
      return { code: 5, stdout: '', stderr: 'Access is denied.', timedOut: false }
    }
    expect(await restrictToOwner('/d/atc', { platform: 'linux', user: 'u', exec, env: {} })).toBeUndefined()
    expect(calls).toEqual([])
    expect(
      await restrictToOwner('C:\\d\\atc', {
        platform: 'win32',
        user: 'u',
        exec,
        systemRoot: 'D:\\Win\\',
        env: {},
      })
    ).toBe('Access is denied.')
    expect(calls).toEqual(['D:\\Win\\System32\\icacls.exe C:\\d\\atc'])
    expect(icaclsPath(undefined)).toBe('C:\\Windows\\System32\\icacls.exe')
  })

  // The folder is read back through the core's `readWindowsAcl` (Get-Acl by SID, any system
  // language) and must pass the core executor's judge, and grant nobody else even read access.
  describe('reading the folder back', () => {
    const dir = 'C:\\a (I) dir\\atc'
    const USER = 'S-1-5-21-1-2-3-1001'
    const FULL = 2032127
    const READ = 1179817
    const owned: WindowsAcl = {
      reparse: false,
      directory: true,
      owner: USER,
      rules: [
        { sid: USER, allow: true, rights: FULL },
        { sid: 'S-1-5-18', allow: true, rights: FULL },
        { sid: 'S-1-5-32-544', allow: true, rights: FULL },
      ],
    }
    const run = async (acl: unknown, answer: { code?: number; stderr?: string } = {}) => {
      const calls: Array<{ command: string; args: readonly string[]; env?: NodeJS.ProcessEnv }> = []
      const exec: ExecFn = async (command, args, options) => {
        calls.push({ command, args, ...(options?.env ? { env: options.env } : {}) })
        if (command.endsWith('powershell.exe'))
          return {
            code: answer.code ?? 0,
            stdout: JSON.stringify(acl),
            stderr: answer.stderr ?? '',
            timedOut: false,
          }
        return { code: 0, stdout: 'processed 1 files', stderr: '', timedOut: false }
      }
      const result = await restrictToOwner(dir, {
        platform: 'win32',
        user: 'HOST\\alice',
        exec,
        systemRoot: 'D:\\Win',
        env: {
          SystemRoot: 'D:\\Win',
          PATH: 'D:\\Win\\System32',
          PSModulePath: 'C:\\Program Files\\PowerShell\\7\\Modules',
        },
      })
      return { result, calls }
    }

    it('grants by icacls, then reads the ACL with PowerShell by its full path and the inherited env', async () => {
      const { result, calls } = await run(owned)
      expect(result).toBeUndefined()
      expect(calls.map((c) => c.command)).toEqual([
        'D:\\Win\\System32\\icacls.exe',
        'D:\\Win\\System32\\icacls.exe',
        'D:\\Win\\System32\\icacls.exe',
        'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      ])
      expect(calls[1]?.args).toEqual([dir, '/remove:g', '*S-1-1-0', '*S-1-5-11', '*S-1-5-32-545', '*S-1-3-0'])
      // From an elevated session the folder's owner is Administrators, and the core's judge would take
      // this user's own grant for another writer: the user becomes the owner.
      expect(calls[2]?.args).toEqual([dir, '/setowner', 'HOST\\alice'])
      expect(calls[3]?.env).toEqual({
        SystemRoot: 'D:\\Win',
        PATH: 'D:\\Win\\System32',
        ATOMIC_HOST_STEP_PATH: dir,
      })
      // What atc accepts, the core's executor accepts.
      expect(judgeWindowsAcl(owned, dir, 'directory')).toBeNull()
    })

    it('accepts CREATOR OWNER, and refuses a read-only grant to Users by its SID', async () => {
      const creator = { ...owned, rules: [...owned.rules, { sid: 'S-1-3-0', allow: true, rights: FULL }] }
      expect((await run(creator)).result).toBeUndefined()
      const users = { ...owned, rules: [...owned.rules, { sid: 'S-1-5-32-545', allow: true, rights: READ }] }
      // The executor's judge looks at writers only; atc keeps the keys and chats unreadable too.
      expect(judgeWindowsAcl(users, dir, 'directory')).toBeNull()
      expect((await run(users)).result).toMatch(/S-1-5-32-545/)
      const denied = { ...owned, rules: [...owned.rules, { sid: 'S-1-1-0', allow: false, rights: FULL }] }
      expect((await run(denied)).result).toBeUndefined()
    })

    it.each([
      [
        'a writer the core refuses',
        { ...owned, rules: [...owned.rules, { sid: 'S-1-5-11', allow: true, rights: 1245631 }] },
        /writable by S-1-5-11/,
      ],
      ['a reparse point', { ...owned, reparse: true }, /reparse point/],
      ['a broad owner', { ...owned, owner: 'S-1-1-0' }, /owned by S-1-1-0/],
      ['an answer without an owner', { reparse: false, directory: true, rules: [] }, /without an owner/],
    ])('refuses %s', async (_name, acl, reason) => {
      expect((await run(acl)).result).toMatch(reason)
    })

    it('reports a PowerShell that fails instead of throwing', async () => {
      expect((await run(owned, { code: 1, stderr: 'Access denied' })).result).toMatch(
        /cannot read the folder's ACL back: .*Access denied/
      )
    })
  })

  // Started from pwsh, the server inherits PowerShell 7's module path; Windows PowerShell then finds
  // Get-Acl's module there, cannot load it (CouldNotAutoloadMatchingModule) and the read fails.
  it('drops PSModulePath in any case so Windows PowerShell uses its own modules', () => {
    expect(
      windowsPowerShellEnv(
        { Path: 'C:\\Windows', PSModulePath: 'C:\\pwsh7', psmodulepath: 'C:\\other' },
        { ATOMIC_HOST_STEP_PATH: 'C:\\d' }
      )
    ).toEqual({ Path: 'C:\\Windows', ATOMIC_HOST_STEP_PATH: 'C:\\d' })
  })
})
