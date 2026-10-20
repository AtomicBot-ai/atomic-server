/**
 * Owner-only access to `atc`'s own folder on Windows, where the POSIX modes the files are written
 * with (0600 keys, admin token, chats) mean nothing. A data folder outside the profile (`--data-folder
 * C:\atc`) would otherwise inherit the drive's ACL, which lets every local user read. The folder gets
 * no inherited entries, no explicit ones for the broad groups (a folder may carry the drive's entries
 * as its own), and full control for this user, SYSTEM and Administrators. Everyone is named by SID, so
 * nothing depends on the system language; its files inherit that. The result is read back through the
 * core (`readWindowsAcl`, Get-Acl by SID) and judged twice: by the core executor's `judgeWindowsAcl`, so
 * a folder atc accepts is one the executor trusts, and by atc's own rule that nobody else may even read.
 */

import { judgeWindowsAcl, readWindowsAcl } from '@atomic-chat/core/host'
import type { WindowsAcl } from '@atomic-chat/core/host'
import type { ExecFn } from './exec.js'

/** SYSTEM and BUILTIN\Administrators. */
const WELL_KNOWN = ['*S-1-5-18', '*S-1-5-32-544'] as const
/** Everyone, Authenticated Users, BUILTIN\Users and CREATOR OWNER. */
const BROAD = ['*S-1-1-0', '*S-1-5-11', '*S-1-5-32-545', '*S-1-3-0'] as const
/** Who besides the owner may hold an allow rule: SYSTEM, Administrators and CREATOR OWNER. */
const TRUSTED = ['S-1-5-18', 'S-1-5-32-544', 'S-1-3-0'] as const

export function ownerOnlyAclArgs(dir: string, user: string): string[] {
  const grants = [...WELL_KNOWN, user].flatMap((who) => ['/grant:r', `${who}:(OI)(CI)F`])
  return [dir, '/inheritance:r', ...grants]
}

/** Explicit entries `/inheritance:r` leaves in place; removing an absent one is not an error. */
export function removeBroadAclArgs(dir: string): string[] {
  return [dir, '/remove:g', ...BROAD]
}

/** icacls by its full path: never one found on PATH, and no name resolution to go wrong. */
export function icaclsPath(systemRoot: string | undefined): string {
  return `${(systemRoot ?? 'C:\\Windows').replace(/[\\/]+$/, '')}\\System32\\icacls.exe`
}

/**
 * Why `acl` is not an owner-only folder, or `undefined` when it is: the core executor's judge (no
 * reparse point, a directory, an owner that is not a broad group, no other writer), then no allow rule
 * for anyone but the owner, SYSTEM, Administrators and CREATOR OWNER — read access included.
 */
export function judgeOwnerOnly(acl: WindowsAcl, dir: string): string | undefined {
  const problem = judgeWindowsAcl(acl, dir, 'directory')
  if (problem) return problem
  const trusted = new Set<string>([acl.owner, ...TRUSTED])
  const others = [...new Set(acl.rules.filter((r) => r.allow && !trusted.has(r.sid)).map((r) => r.sid))]
  return others.length === 0
    ? undefined
    : `the folder still grants more than this user, SYSTEM and Administrators: ${others.join(', ')}`
}

/**
 * Apply it on Windows; elsewhere the file modes already say it. Returns why it failed, if it did. The
 * folder is read back: an exit code of 0 alone does not prove that only the owner is left.
 */
export async function restrictToOwner(
  dir: string,
  options: {
    platform: NodeJS.Platform
    user: string
    exec: ExecFn
    systemRoot?: string | undefined
    /** The environment PowerShell inherits; the core's `exec` only adds to it. */
    env?: NodeJS.ProcessEnv | undefined
  }
): Promise<string | undefined> {
  if (options.platform !== 'win32') return undefined
  const icacls = icaclsPath(options.systemRoot)
  for (const args of [ownerOnlyAclArgs(dir, options.user), removeBroadAclArgs(dir)]) {
    const r = await options.exec(icacls, args, { timeoutMs: 30_000 })
    if (r.error || r.code !== 0) return (r.error ?? r.stderr.trim()) || `icacls exit code ${r.code}`
  }
  let acl: WindowsAcl
  try {
    acl = await readWindowsAcl(dir, {
      exec: async (command, args, o) => {
        const r = await options.exec(command, args, {
          timeoutMs: o?.timeoutMs ?? 30_000,
          env: { ...options.env, ...o?.env },
        })
        return { code: r.error ? null : r.code, stdout: r.stdout, stderr: r.error ?? r.stderr }
      },
      ...(options.systemRoot ? { systemRoot: options.systemRoot } : {}),
    })
  } catch (error) {
    return `cannot read the folder's ACL back: ${error instanceof Error ? error.message : String(error)}`
  }
  return judgeOwnerOnly(acl, dir)
}
