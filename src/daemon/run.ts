/**
 * The server as this process's whole life: atc's own error reports armed before anything starts (a
 * throw nothing caught, a server that could not start), then the server until a signal or a
 * control-API shutdown.
 */

import { createAtcReporter, startupFailureReport, telemetryConsent } from '../telemetry/index.js'
import { startDaemon } from './daemon.js'
import type { DaemonOptions, RunningDaemon } from './daemon.js'

/** How long a report of a server that could not start may hold up its exit. */
const STARTUP_FLUSH_MS = 2_000

/** Run as the foreground process until a signal or a control-API shutdown; the exit code. */
export async function runDaemon(options: DaemonOptions & { printReadyLine?: boolean }): Promise<number> {
  // Listen before starting: a signal during startup (the core, the admin bind)
  // would otherwise kill the process with Node's default handler and leave `daemon.json` behind.
  const started: { daemon?: RunningDaemon } = {}
  let stopRequested = false
  let stopping: Promise<void> | undefined
  const stop = (d: RunningDaemon) => (stopping ??= d.shutdown())
  const signalled = options.io.waitForShutdown(async () => {
    stopRequested = true
    if (started.daemon) await stop(started.daemon)
  })
  const errors =
    options.errors ??
    (await createAtcReporter({
      env: options.io.env,
      consent: telemetryConsent(options.telemetry, options.config),
      dataFolder: options.paths.dataFolder,
      telemetryFile: options.paths.layout.core.telemetry,
      homeDir: options.host.facts.homedir,
      platform: options.host.facts.platform,
      arch: options.host.facts.arch,
      fetch: options.io.fetch,
      warn: (message) => options.log.warn(`error report not sent: ${message}`),
    }))
  options.io.catchFatal?.(errors)
  let daemon: RunningDaemon
  try {
    daemon = await startDaemon({ ...options, errors })
  } catch (error) {
    const report = startupFailureReport(error)
    if (report) {
      errors.capture(report)
      await errors.flush(STARTUP_FLUSH_MS)
    }
    throw error
  }
  started.daemon = daemon
  if (stopRequested) {
    await stop(daemon)
    return 0
  }
  if (options.printReadyLine !== false)
    options.io.stdout(
      `${JSON.stringify({ ...daemon.core.readyLine(), admin_url: daemon.record.admin_url })}\n`
    )
  await Promise.race([signalled, daemon.stopped])
  return 0
}
