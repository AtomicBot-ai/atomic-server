/**
 * Who signed a binary, and the rule an update follows: never less trusted than the binary it replaces.
 * A release signed with a Developer ID (macOS) or Authenticode (Windows) can only be replaced by one
 * signed by the same team or subject; an unsigned or ad-hoc binary (a local build, an early release)
 * accepts any binary whose signature is intact. The checksum has already matched by then; this is what
 * stops a replaced release asset and its replaced `SHA256SUMS` from installing.
 */

import type { ExecFn } from '../host/index.js'

export type Trust =
  | { kind: 'unsigned' }
  /** macOS: a signature that verifies; `team` is the Developer ID team, absent for ad hoc. */
  | { kind: 'codesign'; valid: boolean; team?: string; probeFailed?: boolean }
  /** Windows: the Authenticode status and the signer's subject. */
  | { kind: 'authenticode'; valid: boolean; subject?: string; probeFailed?: boolean }

export const CODESIGN_TIMEOUT_MS = 20_000

export async function trustOf(platform: NodeJS.Platform, path: string, exec: ExecFn): Promise<Trust> {
  if (platform === 'darwin') {
    const verify = await exec('codesign', ['--verify', '--strict', path], { timeoutMs: CODESIGN_TIMEOUT_MS })
    const show = await exec('codesign', ['-dv', '--verbose=2', path], { timeoutMs: CODESIGN_TIMEOUT_MS })
    if (probeDidNotRun(verify) || probeDidNotRun(show))
      return { kind: 'codesign', valid: false, probeFailed: true }
    if (show.code !== 0 && /not signed/i.test(show.stderr)) return { kind: 'unsigned' }
    if (show.code !== 0) return { kind: 'codesign', valid: false, probeFailed: true }
    const team = /^TeamIdentifier=(.+)$/m.exec(show.stderr)?.[1]?.trim()
    return { kind: 'codesign', valid: verify.code === 0, ...(team && team !== 'not set' ? { team } : {}) }
  }
  if (platform === 'win32') {
    const literal = path.replace(/'/g, "''")
    const script = `$s = Get-AuthenticodeSignature -LiteralPath '${literal}'; $s.Status; $s.SignerCertificate.Subject`
    const r = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeoutMs: CODESIGN_TIMEOUT_MS,
    })
    if (probeDidNotRun(r)) return { kind: 'authenticode', valid: false, probeFailed: true }
    const [status = '', subject = ''] = r.stdout.split(/\r?\n/).map((l) => l.trim())
    if (status === 'NotSigned') return { kind: 'unsigned' }
    if (status === '') return { kind: 'authenticode', valid: false, probeFailed: true }
    return { kind: 'authenticode', valid: status === 'Valid', ...(subject ? { subject } : {}) }
  }
  return { kind: 'unsigned' }
}

/** Why `next` may not replace `current`, or undefined when it may. */
export function trustDowngrade(current: Trust, next: Trust): string | undefined {
  if (unreadable(current) || unreadable(next)) return 'its signature could not be read'
  if (next.kind !== 'unsigned' && !next.valid) return 'its signature does not verify'
  if (current.kind === 'codesign' && current.team) {
    if (next.kind !== 'codesign' || next.team !== current.team)
      return `it is not signed by team ${current.team}, as the installed atc is`
  }
  if (current.kind === 'authenticode' && current.subject) {
    if (next.kind !== 'authenticode' || next.subject !== current.subject)
      return `it is not signed by ${current.subject}, as the installed atc is`
  }
  return undefined
}

function probeDidNotRun(result: { error?: string; timedOut: boolean; code: number | null }): boolean {
  return result.error !== undefined || result.timedOut || result.code === null
}

function unreadable(trust: Trust): boolean {
  return trust.kind !== 'unsigned' && trust.probeFailed === true
}
