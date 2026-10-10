/**
 * Start `atc daemon` as an independent process: detached, its stdout and stderr in
 * `daemon.out.log` (never a pipe the parent might close; overwritten on each start, since the
 * server writes and rotates `daemon.log` itself), and left running when this command exits.
 * Readiness is read from the core's lock by the caller, not from this child.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, openSync, closeSync } from 'node:fs'
import type { AtcPaths } from '../config/index.js'
import { AtcError } from '../errors/index.js'
import type { Logger } from '../output/index.js'

export interface SpawnDaemonOptions {
  paths: AtcPaths
  selfCommand: readonly string[]
  log: Logger
  /** Extra daemon flags (admin port, telemetry…); `--data-folder` and `--control-port 0` are always set. */
  args?: readonly string[]
  env?: NodeJS.ProcessEnv
}

export function daemonArgs(paths: AtcPaths, extra: readonly string[] = []): string[] {
  return ['daemon', '--data-folder', paths.dataFolder, '--control-port', '0', ...extra]
}

export async function spawnDaemon(options: SpawnDaemonOptions): Promise<{ pid: number | undefined }> {
  const [exe, ...prefix] = options.selfCommand
  if (!exe) throw new AtcError('ATC_INTERNAL', 'no program to start the daemon with')
  mkdirSync(options.paths.logsDir, { recursive: true })
  const logFd = openSync(options.paths.daemonOutLog, 'w')
  const args = [...prefix, ...daemonArgs(options.paths, options.args)]
  options.log.debug(`spawning: ${[exe, ...args].join(' ')}`)
  const child = spawn(exe, args, {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    ...(options.env ? { env: options.env } : {}),
  })
  const failed = await new Promise<Error | undefined>((resolve) => {
    child.once('error', (error) => resolve(error))
    child.once('spawn', () => resolve(undefined))
  })
  closeSync(logFd)
  if (failed)
    throw new AtcError('ATC_DAEMON_START_FAILED', 'Could not start the server.', {
      details: failed.message,
    })
  child.unref()
  return { pid: child.pid }
}
