/**
 * A server from another `atc` build owns the data folder. The core attaches only to an owner of its
 * own version (`CORE_PROTOCOL_MISMATCH` otherwise), so after an update `atc stop`, `restart` and
 * `start` could not reach the server the old binary started. The control API checks only loopback,
 * `Host` and the bearer token — not the client's version — so this module talks to the old owner
 * directly: read the lock and the token, take a snapshot, ask it to shut down, wait for the lock,
 * and with `--kill` end the pid the lock names.
 */

import { CORE_VERSION } from '@atomic-chat/core'
import { CoreClient } from '@atomic-chat/core/client'
import { CONTROL_PROTOCOL_VERSION } from '@atomic-chat/core/contracts'
import { inspectLock, readControlToken } from '@atomic-chat/core/host'
import type { LockRecord } from '@atomic-chat/core/host'
import type { AtcPaths } from '../config/index.js'
import { AtcError } from '../errors/index.js'
import { readDaemonRecord } from './daemon-record.js'
import type { DaemonRecord } from './daemon-record.js'

export const STOP_TIMEOUT_MS = 30_000
export const KILL_TIMEOUT_MS = 5_000

export interface OutdatedOwner {
  lock: LockRecord
  /** The `atc` record of the same instance, when the owner wrote one. */
  record: DaemonRecord | undefined
}

/** What the old owner said, or why nothing was asked. */
export type OwnerView =
  | { kind: 'snapshot'; instance_id: string; clients: readonly string[] }
  | { kind: 'unreachable' }
  | { kind: 'unknown-protocol' }

export type StaleStopPlan =
  { kind: 'shutdown'; force: boolean } | { kind: 'kill' } | { kind: 'refuse'; error: AtcError }

/** True once no owner with `instanceId` holds the folder; false after `timeoutMs`. */
export async function waitForRelease(
  paths: Pick<AtcPaths, 'layout'>,
  instanceId: string,
  now: () => Date,
  timeoutMs = STOP_TIMEOUT_MS
): Promise<boolean> {
  const deadline = now().getTime() + timeoutMs
  while (now().getTime() < deadline) {
    const state = await inspectLock(paths.layout)
    if (state.kind !== 'owned' || state.record.instance_id !== instanceId) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

/** The owner when it is a ready CLI-scope core of another version than the one embedded here. */
export async function findOutdatedOwner(
  paths: Pick<AtcPaths, 'layout' | 'daemonRecord'>
): Promise<OutdatedOwner | undefined> {
  const state = await inspectLock(paths.layout)
  if (state.kind !== 'owned' || state.record.state !== 'ready') return undefined
  if (state.record.owner_scope === 'app' || state.record.version === CORE_VERSION) return undefined
  const record = await readDaemonRecord(paths.daemonRecord)
  return { lock: state.record, record: record?.instance_id === state.record.instance_id ? record : undefined }
}

export function outdatedError(owner: OutdatedOwner): AtcError {
  const build = owner.record
    ? `atc ${owner.record.atc_version}, core ${owner.lock.version}`
    : `core ${owner.lock.version}`
  return new AtcError(
    'ATC_DAEMON_OUTDATED',
    `The running server is another build (${build}); this atc embeds core ${CORE_VERSION}.`,
    {
      details: `pid ${owner.lock.pid}`,
      hint: '`atc restart` replaces it (add --force while other atc commands are attached)',
    }
  )
}

/** Pure: what to do with the old owner, given what it answered and the flags. */
export function planStaleStop(
  owner: OutdatedOwner,
  view: OwnerView,
  flags: { force: boolean; kill: boolean }
): StaleStopPlan {
  if (view.kind !== 'snapshot') {
    if (flags.kill) return { kind: 'kill' }
    const why =
      view.kind === 'unknown-protocol'
        ? `it speaks control protocol ${owner.lock.protocol}, this atc speaks ${CONTROL_PROTOCOL_VERSION}`
        : 'its control API does not answer'
    return {
      kind: 'refuse',
      error: new AtcError('ATC_DAEMON_OUTDATED', `Cannot ask the running server to stop: ${why}.`, {
        details: `pid ${owner.lock.pid}`,
        hint: 'retry with --kill to end the process',
      }),
    }
  }
  if (view.instance_id !== owner.lock.instance_id) {
    return {
      kind: 'refuse',
      error: new AtcError('ATC_DAEMON_OUTDATED', 'The server changed while it was being stopped.', {
        hint: 'run the command again',
      }),
    }
  }
  if (view.clients.length > 0 && !flags.force) {
    return {
      kind: 'refuse',
      error: new AtcError('ATC_DAEMON_ALREADY_RUNNING', 'Other clients are attached to the running server.', {
        details: view.clients.join(', '),
        hint: 'retry with --force',
      }),
    }
  }
  return { kind: 'shutdown', force: view.clients.length > 0 }
}

export interface StopOutdatedOptions {
  paths: Pick<AtcPaths, 'layout'>
  owner: OutdatedOwner
  force: boolean
  kill: boolean
  now: () => Date
  /** Ends a process; required for `kill`. */
  killProcess?: (pid: number) => Promise<void>
  fetch?: typeof fetch
  timeoutMs?: number
}

async function viewOwner(options: StopOutdatedOptions): Promise<{ view: OwnerView; client?: CoreClient }> {
  const { lock } = options.owner
  if (lock.protocol !== CONTROL_PROTOCOL_VERSION) return { view: { kind: 'unknown-protocol' } }
  try {
    const token = await readControlToken(options.paths.layout)
    const client = new CoreClient({
      baseUrl: `http://${lock.control_host}:${lock.control_port}`,
      token,
      name: 'atc',
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
    const snapshot = await client.snapshot()
    const clients = snapshot.clients.map((c) => c.name)
    return { view: { kind: 'snapshot', instance_id: snapshot.instance_id, clients }, client }
  } catch {
    return { view: { kind: 'unreachable' } }
  }
}

/** Stop the old owner or throw why not. Resolves once its lock is gone. */
export async function stopOutdatedOwner(options: StopOutdatedOptions): Promise<void> {
  const { owner, paths, now } = options
  const { view, client } = await viewOwner(options)
  const plan = planStaleStop(owner, view, { force: options.force, kill: options.kill })
  if (plan.kind === 'refuse') throw plan.error
  let released = false
  if (plan.kind === 'shutdown' && client) {
    await client.shutdown(plan.force ? { force: true } : {})
    released = await waitForRelease(paths, owner.lock.instance_id, now, options.timeoutMs)
  }
  if (!released && options.kill && options.killProcess) {
    await options.killProcess(owner.lock.pid)
    released = await waitForRelease(paths, owner.lock.instance_id, now, KILL_TIMEOUT_MS)
  }
  if (!released)
    throw new AtcError('ATC_DAEMON_ALREADY_RUNNING', 'The server did not stop in time.', {
      hint: 'retry with --kill',
    })
}
