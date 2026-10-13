/**
 * Owner-only access to `atc`'s own folder on Windows, where the POSIX modes the files are written
 * with (0600 keys, admin token, chats) mean nothing. A data folder outside the profile (`--data-folder
 * C:\atc`) would otherwise inherit the drive's ACL, which lets every local user read. The folder gets
 * no inherited entries, no explicit ones for the broad groups (a folder may carry the drive's entries
 * as its own), and full control for this user, SYSTEM and Administrators. Everyone is named by SID, so
 * nothing depends on the system language; its files inherit that.
 */

import type { ExecFn } from './exec.js'

/** SYSTEM and BUILTIN\Administrators. */
const WELL_KNOWN = ['*S-1-5-18', '*S-1-5-32-544'] as const
/** Everyone, Authenticated Users, BUILTIN\Users and CREATOR OWNER. */
const BROAD = ['*S-1-1-0', '*S-1-5-11', '*S-1-5-32-545', '*S-1-3-0'] as const
/** The entries an owner-only folder lists: the well-known two and this user. */
const OWNER_ONLY_ENTRIES = WELL_KNOWN.length + 1

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
 * The entries `icacls <dir>` lists for the folder, or why it lists none: the listing must name the
 * folder, so an empty or foreign output is not read as an owner-only folder. NULs are dropped in case
 * it wrote UTF-16. An entry is a line with `name:(flags)`; `(I)` marks an inherited one in every
 * language.
 */
export function readListing(stdout: string, dir: string): { entries: string[] } | { unreadable: string } {
  const text = stdout.replace(/\0/g, '')
  if (!text.includes(dir)) return { unreadable: JSON.stringify(text.slice(0, 300)) }
  // The folder's own name may contain anything; only what follows it is an entry.
  const entries = text
    .split(dir)
    .join('')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(':('))
  return { entries }
}

/**
 * Apply it on Windows; elsewhere the file modes already say it. Returns why it failed, if it did. The
 * folder is read back: an exit code of 0 alone does not prove that only the owner is left.
 */
export async function restrictToOwner(
  dir: string,
  options: { platform: NodeJS.Platform; user: string; exec: ExecFn; systemRoot?: string | undefined }
): Promise<string | undefined> {
  if (options.platform !== 'win32') return undefined
  const icacls = icaclsPath(options.systemRoot)
  for (const args of [ownerOnlyAclArgs(dir, options.user), removeBroadAclArgs(dir)]) {
    const r = await options.exec(icacls, args, { timeoutMs: 30_000 })
    if (r.error || r.code !== 0) return (r.error ?? r.stderr.trim()) || `icacls exit code ${r.code}`
  }
  const check = await options.exec(icacls, [dir], { timeoutMs: 30_000 })
  if (check.error || check.code !== 0)
    return `cannot read the folder's ACL back: ${check.error ?? check.stderr.trim()}`
  const listing = readListing(check.stdout, dir)
  if ('unreadable' in listing) return `icacls exited 0 but did not list the folder: ${listing.unreadable}`
  const { entries } = listing
  if (entries.some((e) => e.includes('(I)')) || entries.length > OWNER_ONLY_ENTRIES)
    return `the folder still grants more than this user, SYSTEM and Administrators: ${entries.join('; ')}`
  return undefined
}
