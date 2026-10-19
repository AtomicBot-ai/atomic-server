import type { CoreSnapshot } from '@atomic-chat/core/client'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { AtcError } from '../errors/index.js'
import type { DaemonRecord } from './daemon-record.js'
import type { CoreLink } from './link.js'
import { attachIfRunning, describeSnapshot, startDaemon } from './lifecycle.js'

const snapshot = {
  instance_id: 'i1',
  protocol: 1,
  version: '0.5.1',
  pid: 10,
  data_folder: '/d',
  cursor: '',
  sessions: [{ provider: 'p', model_id: 'm', port: 8001, pid: 2 }],
  server: {
    running: false,
    host: '127.0.0.1',
    port: 1337,
    prefix: '/v1',
    requires_api_key: false,
    pid: null,
  },
  clients: [{ id: 'c', name: 'atc status', pid: 3 }],
  downloads: [],
} as unknown as CoreSnapshot

const record: DaemonRecord = {
  schema_version: 1,
  pid: 10,
  instance_id: 'i1',
  state: 'ready',
  atc_version: '0.1.0',
  core_version: '0.5.1',
  control_url: '',
  admin_url: 'http://127.0.0.1:1338',
  started_at: 1_000,
}

describe('describeSnapshot', () => {
  it('joins the snapshot with the record', () => {
    expect(describeSnapshot(snapshot, record, () => new Date(61_000))).toMatchObject({
      running: true,
      pid: 10,
      atc_version: '0.1.0',
      uptime_ms: 60_000,
      admin_url: 'http://127.0.0.1:1338',
      state: 'ready',
      sessions: [{ provider: 'p', model_id: 'm', port: 8001 }],
      clients: ['atc status'],
    })
  })

  it('leaves what only the record knows empty without one', () => {
    expect(describeSnapshot(snapshot, undefined, () => new Date(0))).toMatchObject({
      atc_version: null,
      started_at: null,
      uptime_ms: null,
      admin_url: null,
      state: null,
    })
  })
})

describe('attachIfRunning', () => {
  it('answers undefined for "not running" and passes other failures on', async () => {
    const link = {} as CoreLink
    expect(await attachIfRunning(async () => link)).toBe(link)
    const notRunning = new AtcError('ATC_DAEMON_NOT_RUNNING', 'no')
    expect(await attachIfRunning(async () => Promise.reject(notRunning))).toBeUndefined()
    const foreign = new AtcError('ATC_DAEMON_FOREIGN', 'foreign')
    await expect(attachIfRunning(async () => Promise.reject(foreign))).rejects.toBe(foreign)
  })
})

describe('startDaemon', () => {
  // A server that fails while starting removes its record (and releases the core): say so at once,
  // with what its log says, not after waiting out the timeout for a `ready` that never comes.
  it('reports a server that went away while starting, with its log tail', async () => {
    const { paths, cleanup } = tmpDataFolder('atc-start-')
    try {
      await mkdir(dirname(paths.daemonRecord), { recursive: true })
      await mkdir(dirname(paths.daemonOutLog), { recursive: true })
      await writeFile(paths.daemonRecord, JSON.stringify({ ...record, state: 'starting', admin_url: null }))
      await writeFile(paths.daemonOutLog, 'error: the admin port 1338 is in use\n')
      setTimeout(() => void rm(paths.daemonRecord, { force: true }), 150)
      const link = { endpoint: { instanceId: 'i1' } } as CoreLink
      const started = Date.now()
      await expect(startDaemon(async () => link, paths)).rejects.toMatchObject({
        code: 'ATC_DAEMON_START_FAILED',
        details: expect.stringContaining('admin port 1338 is in use'),
      })
      expect(Date.now() - started).toBeLessThan(5_000)
    } finally {
      cleanup()
    }
  })
})
