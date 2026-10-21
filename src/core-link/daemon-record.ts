/**
 * `<data>/atc/run/daemon.json`: what the `atc` daemon publishes about itself beyond the core's
 * lock — its state, its admin address and versions — and the proof that the owner of the folder is
 * an `atc` daemon at all, not the core's own CLI daemon on the same folder (which has no admin
 * server and no host-step loop). It is written as `starting` the moment the core is up, before the
 * slow parts (hardware probe, admin listener), and rewritten as `ready` after them. A record whose
 * `instance_id` differs from the lock's is stale.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ServerLaunch } from '../contract/index.js'
import { replaceFile } from '../terminal-data/index.js'
import type { RenameFn } from '../terminal-data/index.js'

export interface DaemonRecord {
  schema_version: 1
  pid: number
  instance_id: string
  /** `starting` proves an atc daemon owns the folder; `ready` means the admin (if any) listens. */
  state: 'starting' | 'ready'
  atc_version: string
  core_version: string
  control_url: string
  admin_url: string | null
  started_at: number
  /** How this server was started (absent in a record of an older build: read as `terminal`). */
  launch?: ServerLaunch
  /** The systemd unit this server runs as, without `.service` (absent outside systemd). */
  service?: string
}

export async function readDaemonRecord(path: string): Promise<DaemonRecord | undefined> {
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as Partial<DaemonRecord>
    if (raw.schema_version !== 1 || typeof raw.instance_id !== 'string' || typeof raw.pid !== 'number')
      return undefined
    return { ...raw, state: raw.state === 'starting' ? 'starting' : 'ready' } as DaemonRecord
  } catch {
    return undefined
  }
}

export async function writeDaemonRecord(
  path: string,
  record: DaemonRecord,
  deps: { rename?: RenameFn } = {}
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${record.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`)
  // Clients poll this record while the server starts: on Windows the rename may meet an open reader.
  await replaceFile(tmp, path, deps.rename)
}

export async function removeDaemonRecord(path: string, instanceId: string): Promise<void> {
  const current = await readDaemonRecord(path)
  if (current && current.instance_id !== instanceId) return // a newer daemon already owns the file
  await rm(path, { force: true })
}
