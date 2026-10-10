/** The program under e2e: `dist/bin/atc-<triple>` when built, otherwise `node dist/bin.js`. */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { targetFor } from '../../src/update/targets.js'

// Not `.pathname`: on Windows that is `/C:/…`, which neither `join` nor `spawn` accepts.
export const ROOT = fileURLToPath(new URL('../..', import.meta.url))
/** The host's default target, the one `npm run build:bin` builds. */
const host = targetFor(process.platform, process.arch)
export const BINARY = join(
  ROOT,
  'dist/bin',
  `atc-${host?.triple ?? 'unsupported'}${process.platform === 'win32' ? '.exe' : ''}`
)
/** The command line that runs atc: the binary, or node and the script. */
export const ATC: readonly string[] = existsSync(BINARY)
  ? [BINARY]
  : [process.execPath, join(ROOT, 'dist/bin.js')]

export interface AtcResult {
  code: number | null
  out: string
  err: string
}

export function runAtc(
  args: readonly string[],
  options: { sudo?: boolean; timeoutMs?: number } = {}
): AtcResult {
  const line = options.sudo ? ['sudo', '-E', ...ATC, ...args] : [...ATC, ...args]
  const [exe, ...rest] = line
  const res = spawnSync(exe as string, rest, {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: options.timeoutMs ?? 60_000,
  })
  return { code: res.status, out: res.stdout, err: res.stderr }
}
