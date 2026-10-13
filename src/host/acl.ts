/**
 * Owner-only access to `atc`'s own folder on Windows, where the POSIX modes the files are written
 * with (0600 keys, admin token, chats) mean nothing. A data folder outside the profile (`--data-folder
 * C:\atc`) would otherwise inherit the drive's ACL, which lets every local user read. The folder gets
 * no inherited entries and full control for this user, SYSTEM and Administrators (by SID, so the
 * names do not depend on the system language); its files inherit that.
 */

import type { ExecFn } from './exec.js'

/** SYSTEM and BUILTIN\Administrators. */
const WELL_KNOWN = ['*S-1-5-18', '*S-1-5-32-544'] as const

export function ownerOnlyAclArgs(dir: string, user: string): string[] {
  const grants = [...WELL_KNOWN, user].flatMap((who) => ['/grant:r', `${who}:(OI)(CI)F`])
  return [dir, '/inheritance:r', ...grants]
}

/** icacls by its full path: never one found on PATH, and no name resolution to go wrong. */
export function icaclsPath(systemRoot: string | undefined): string {
  return `${(systemRoot ?? 'C:\\Windows').replace(/[\\/]+$/, '')}\\System32\\icacls.exe`
}

/**
 * What `icacls <dir>` says about the folder, or why it says nothing: the listing must name the folder,
 * so an empty or foreign output is not read as "no inherited entries". NULs are dropped in case it
 * wrote UTF-16.
 */
export function readListing(stdout: string, dir: string): { inherited: boolean } | { unreadable: string } {
  const text = stdout.replace(/\0/g, '')
  if (!text.includes(dir)) return { unreadable: JSON.stringify(text.slice(0, 300)) }
  // `(I)` marks an inherited entry in every language; the folder's own name may contain anything.
  return { inherited: text.split(dir).join('').includes('(I)') }
}

/**
 * Apply it on Windows; elsewhere the file modes already say it. Returns why it failed, if it did. The
 * folder is read back: an exit code of 0 alone does not prove the drive's entries are gone.
 */
export async function restrictToOwner(
  dir: string,
  options: { platform: NodeJS.Platform; user: string; exec: ExecFn; systemRoot?: string | undefined }
): Promise<string | undefined> {
  if (options.platform !== 'win32') return undefined
  const icacls = icaclsPath(options.systemRoot)
  const r = await options.exec(icacls, ownerOnlyAclArgs(dir, options.user), { timeoutMs: 30_000 })
  if (r.error || r.code !== 0) return (r.error ?? r.stderr.trim()) || `icacls exit code ${r.code}`
  const check = await options.exec(icacls, [dir], { timeoutMs: 30_000 })
  if (check.error || check.code !== 0)
    return `cannot read the folder's ACL back: ${check.error ?? check.stderr.trim()}`
  const said = JSON.stringify((r.stdout + r.stderr).trim())
  const listing = readListing(check.stdout, dir)
  if ('unreadable' in listing)
    return `icacls exited 0 but did not list the folder: ${listing.unreadable} (it said ${said} when applied)`
  if (listing.inherited)
    return `icacls exited 0 but the folder still inherits: ${check.stdout.trim()} (it said ${said} when applied)`
  return undefined
}
