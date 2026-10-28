/**
 * Running a program on the host: never through a shell, always with a timeout and an output cap,
 * and a missing or hung program reported as `code: null` rather than thrown — a probe that could
 * not run is an "unknown", which callers treat as a blocker, not as "absent".
 */

import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { posix, win32 } from 'node:path'

export interface ExecResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  /** Why it could not run at all (ENOENT, EACCES…). */
  error?: string
}

export interface ExecOptions {
  timeoutMs?: number
  maxOutputBytes?: number
  env?: NodeJS.ProcessEnv
  cwd?: string
  signal?: AbortSignal
  /** `inherit` lets a privileged helper prompt on the terminal. */
  stdio?: 'pipe' | 'inherit'
}

export type ExecFn = (command: string, args: readonly string[], options?: ExecOptions) => Promise<ExecResult>

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_OUTPUT = 1024 * 1024

export const execCommand: ExecFn = (command, args, options = {}) =>
  new Promise<ExecResult>((resolve) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const cap = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT
    const inherit = options.stdio === 'inherit'
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    const done = (result: ExecResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    const child = spawn(command, [...args], {
      stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(options.env ? { env: options.env } : {}),
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    const collect = (chunk: Buffer, which: 'out' | 'err') => {
      const text = chunk.toString()
      if (which === 'out') stdout = (stdout + text).slice(0, cap)
      else stderr = (stderr + text).slice(0, cap)
    }
    child.stdout?.on('data', (c: Buffer) => collect(c, 'out'))
    child.stderr?.on('data', (c: Buffer) => collect(c, 'err'))
    child.once('error', (error) => done({ code: null, stdout, stderr, timedOut, error: error.message }))
    child.once('close', (code) => done({ code: timedOut ? null : code, stdout, stderr, timedOut }))
  })

/** Whether `name` resolves on PATH, without spawning it. Pure given `env` and `platform`. */
export function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = fileIsExecutable
): string | undefined {
  const path = env['PATH'] ?? env['Path'] ?? ''
  const extensions = platform === 'win32' ? (env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : ['']
  const { join } = platform === 'win32' ? win32 : posix
  for (const dir of path.split(platform === 'win32' ? ';' : ':').filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = join(dir, `${name}${ext.toLowerCase()}`)
      if (exists(candidate)) return candidate
      if (ext && exists(join(dir, `${name}${ext}`))) return join(dir, `${name}${ext}`)
    }
  }
  return undefined
}

/** Whether `path` is a file this process may run. */
export function fileIsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}
