/** Non-blocking E2E commands: keep Vitest's worker RPC responsive while a cold server starts. */
import { execFile } from 'node:child_process'
import { ATC } from './binary.js'
import type { AtcResult } from './binary.js'

interface ProcessOptions {
  timeoutMs?: number
  /** Complete child environment when supplied, so removed parent variables stay removed. */
  env?: NodeJS.ProcessEnv
  input?: string
}

export function runProcess(
  command: string,
  args: readonly string[],
  options: ProcessOptions = {}
): Promise<AtcResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      [...args],
      {
        encoding: 'utf8',
        env: { ...(options.env ?? process.env), NO_COLOR: '1' },
        timeout: options.timeoutMs ?? 60_000,
        killSignal: 'SIGKILL',
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      },
      (error, out, err) =>
        resolve({
          code: error ? (typeof error.code === 'number' ? error.code : null) : 0,
          out,
          err: error && typeof error.code !== 'number' ? `${err}\n${error.message}`.trim() : err,
        })
    )
    // A child that exits without reading its input can close stdin early (EPIPE).
    child.stdin?.on('error', () => {})
    child.stdin?.end(options.input ?? '')
  })
}

export function runAtcAsync(
  args: readonly string[],
  options: ProcessOptions & { sudo?: boolean } = {}
): Promise<AtcResult> {
  const [command, ...rest] = [...(options.sudo ? ['sudo', '-E'] : []), ...ATC, ...args]
  return runProcess(command!, rest, options)
}
