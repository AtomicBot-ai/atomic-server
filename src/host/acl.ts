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

/** Apply it on Windows; elsewhere the file modes already say it. Returns why it failed, if it did. */
export async function restrictToOwner(
  dir: string,
  options: { platform: NodeJS.Platform; user: string; exec: ExecFn }
): Promise<string | undefined> {
  if (options.platform !== 'win32') return undefined
  const r = await options.exec('icacls', ownerOnlyAclArgs(dir, options.user), { timeoutMs: 30_000 })
  if (r.error || r.code !== 0) return (r.error ?? r.stderr.trim()) || `icacls exit code ${r.code}`
  return undefined
}
