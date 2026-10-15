/**
 * Find the daemon that owns the data folder, or start one. The lock, the token and the handshake
 * are the core's (`@atomic-chat/core/host`); what `atc` adds is the spawn with a log file instead
 * of a pipe, the check that the owner is an `atc` daemon rather than the core CLI's, and the
 * replacement of a server another `atc` build left running (`stale-owner.ts`).
 */

import { readFile } from 'node:fs/promises'
import { AtomicCoreError } from '@atomic-chat/core'
import { attachToOwner, inspectLock, waitForPublishedOwner } from '@atomic-chat/core/host'
import type { AtcPaths } from '../config/index.js'
import { AtcError } from '../errors/index.js'
import type { Logger } from '../output/index.js'
import { readDaemonRecord } from './daemon-record.js'
import type { DaemonRecord } from './daemon-record.js'
import { SseEvents } from './events.js'
import { HttpCoreLink } from './link.js'
import { findOutdatedOwner, outdatedError, stopOutdatedOwner } from './stale-owner.js'
import type { CoreLink } from './link.js'

export const DAEMON_START_TIMEOUT_MS = 20_000
/** The lock goes `ready` inside the core; the `starting` record follows right after (slow runners: seconds). */
export const DAEMON_RECORD_TIMEOUT_MS = 20_000
/** From `starting` to `ready`: the hardware probe (PowerShell on Windows) and the admin listener. */
export const DAEMON_READY_TIMEOUT_MS = 30_000

export interface AttachOptions {
  paths: AtcPaths
  /** Start a daemon when none owns the folder. */
  launch: boolean
  clientName: string
  pid: number
  log: Logger
  spawnDaemon: () => Promise<void>
  timeoutMs?: number
}

export async function attachCore(options: AttachOptions): Promise<CoreLink> {
  const { paths, log } = options
  const layout = paths.layout
  const timeoutMs = options.timeoutMs ?? DAEMON_START_TIMEOUT_MS
  const attach = () =>
    attachToOwner({ layout, clientName: options.clientName, launch: false, log: (m) => log.debug(m) })
  let owner
  try {
    owner = await attach()
  } catch (error) {
    if (!(error instanceof AtomicCoreError)) throw error
    if (error.code === 'CORE_PROTOCOL_MISMATCH') {
      // Another atc build left its server running (an update replaced the binary under it).
      const outdated = await findOutdatedOwner(paths)
      if (!outdated) throw error
      if (!options.launch) throw outdatedError(outdated)
      log.info(`replacing the server of another build (core ${outdated.lock.version})`)
      await stopOutdatedOwner({ paths, owner: outdated, force: false, kill: false, now: () => new Date() })
    } else if (error.code !== 'CORE_NOT_RUNNING') throw error
    else if (!options.launch) {
      throw new AtcError('ATC_DAEMON_NOT_RUNNING', 'Atomic Server is not running for this data folder.', {
        details: paths.dataFolder,
        hint: 'start it with `atc start`',
      })
    }
    const state = await inspectLock(layout)
    const spawned = state.kind !== 'owned'
    if (spawned) {
      log.info('starting the server')
      await options.spawnDaemon()
    } else log.debug('a server is starting; waiting for it')
    try {
      await waitForPublishedOwner(layout, { timeoutMs })
      owner = await attach()
    } catch (failure) {
      // A server that dies while starting (a busy admin port, a broken config) leaves its reason in
      // the log, not in the lock; "cannot reach the core" alone sends people looking elsewhere.
      if (!spawned || !(failure instanceof AtomicCoreError)) throw failure
      throw new AtcError('ATC_DAEMON_START_FAILED', 'The server did not start.', {
        details: (await logTail(paths.daemonOutLog)) ?? (await logTail(paths.daemonLog)) ?? failure.message,
        hint: 'see `atc logs`',
      })
    }
  }
  const record = await waitForDaemonRecord(
    paths.daemonRecord,
    owner.record.instance_id,
    DAEMON_RECORD_TIMEOUT_MS
  )
  if (!record) {
    throw new AtcError(
      'ATC_DAEMON_FOREIGN',
      'The data folder is owned by a core that is not Atomic Server.',
      {
        details: `pid ${owner.record.pid}, core ${owner.record.version} — probably \`atomic-chat-core\`'s own CLI`,
        hint: 'stop it (`atomic-chat-core shutdown`) or use a separate --data-folder',
      }
    )
  }
  return new HttpCoreLink({
    endpoint: {
      baseUrl: `http://${owner.record.control_host}:${owner.record.control_port}`,
      instanceId: owner.record.instance_id,
      version: owner.record.version,
      pid: owner.record.pid,
    },
    client: owner.client,
    events: new SseEvents(owner.client, { log: (m) => log.debug(m) }),
    pid: options.pid,
    log: (m) => log.debug(m),
  })
}

/** The last few lines of the daemon log, or undefined when there is none. */
async function logTail(path: string, lines = 4): Promise<string | undefined> {
  const text = await readFile(path, 'utf8').catch(() => undefined)
  if (!text) return undefined
  return text.trimEnd().split(/\r?\n/).slice(-lines).join('\n')
}

/** The record for this owner in any state, or undefined when none appears in time (a foreign owner never writes one). */
export async function waitForDaemonRecord(
  path: string,
  instanceId: string,
  timeoutMs: number
): Promise<DaemonRecord | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const record = await readDaemonRecord(path)
    if (record && record.instance_id === instanceId) return record
    if (Date.now() >= deadline) return undefined
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** The record once it says `ready`, or the latest one when that takes too long. */
export async function waitForDaemonReady(
  path: string,
  instanceId: string,
  timeoutMs = DAEMON_READY_TIMEOUT_MS
): Promise<DaemonRecord | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const record = await readDaemonRecord(path)
    if (record && record.instance_id === instanceId && record.state === 'ready') return record
    if (Date.now() >= deadline) return record
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
