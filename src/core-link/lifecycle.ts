/**
 * The daemon from a client's point of view: is it there, what does it say about itself, start it,
 * stop it. `atc start|stop|restart|status` and the terminal UI share these; the commands add the
 * printing, the TUI the screen.
 */

import type { CoreSnapshot } from '@atomic-chat/core/client'
import type { AtcPaths } from '../config/index.js'
import { AtcError } from '../errors/index.js'
import { readDaemonRecord } from './daemon-record.js'
import type { DaemonRecord } from './daemon-record.js'
import { waitForDaemonReady } from './attach.js'
import type { CoreLink } from './link.js'
import { waitForRelease } from './stale-owner.js'

export type AttachFn = (options: { launch: boolean; daemonArgs?: readonly string[] }) => Promise<CoreLink>

/** The link when a daemon owns the folder, `undefined` when none does; other failures throw. */
export async function attachIfRunning(attach: AttachFn): Promise<CoreLink | undefined> {
  try {
    return await attach({ launch: false })
  } catch (error) {
    if (error instanceof AtcError && error.code === 'ATC_DAEMON_NOT_RUNNING') return undefined
    throw error
  }
}

export interface DaemonDescription {
  running: true
  pid: number
  core_version: string
  atc_version: string | null
  instance_id: string
  started_at: number | null
  uptime_ms: number | null
  data_folder: string
  api: CoreSnapshot['server']
  admin_url: string | null
  state: DaemonRecord['state'] | null
  sessions: Array<{ provider: string; model_id: string; port: number }>
  clients: string[]
}

/** What `atc status` prints: the core's snapshot joined with the daemon record. */
export function describeSnapshot(
  snapshot: CoreSnapshot,
  record: DaemonRecord | undefined,
  now: () => Date
): DaemonDescription {
  return {
    running: true,
    pid: snapshot.pid,
    core_version: snapshot.version,
    atc_version: record?.atc_version ?? null,
    instance_id: snapshot.instance_id,
    started_at: record?.started_at ?? null,
    uptime_ms: record ? now().getTime() - record.started_at : null,
    data_folder: snapshot.data_folder,
    api: snapshot.server,
    admin_url: record?.admin_url ?? null,
    state: record?.state ?? null,
    sessions: snapshot.sessions.map((s) => ({ provider: s.provider, model_id: s.model_id, port: s.port })),
    clients: snapshot.clients.map((c) => c.name),
  }
}

export async function describeDaemon(
  link: CoreLink,
  recordPath: string,
  now: () => Date
): Promise<DaemonDescription> {
  const [snapshot, record] = await Promise.all([link.snapshot(), readDaemonRecord(recordPath)])
  return describeSnapshot(snapshot, record, now)
}

/** Start a daemon (or find the one starting) and wait until its record says `ready`. */
export async function startDaemon(
  attach: AttachFn,
  paths: Pick<AtcPaths, 'daemonRecord'>,
  daemonArgs: readonly string[] = []
): Promise<CoreLink> {
  const link = await attach({ launch: true, daemonArgs })
  await waitForDaemonReady(paths.daemonRecord, link.endpoint.instanceId)
  return link
}

/**
 * Ask the daemon to shut down under a lease named `client` and wait for the lock to go. Returns
 * whether it went in time; the core refuses (and this throws) while other clients hold leases,
 * unless `force`.
 */
export async function stopDaemon(
  link: CoreLink,
  paths: Pick<AtcPaths, 'layout'>,
  options: { client: string; force?: boolean; now: () => Date; timeoutMs?: number }
): Promise<boolean> {
  const instanceId = link.endpoint.instanceId
  await link.withLease(options.client, async (l, clientId) => {
    await l.shutdown({ client_id: clientId, ...(options.force === true ? { force: true } : {}) })
  })
  return waitForRelease(paths, instanceId, options.now, options.timeoutMs)
}
