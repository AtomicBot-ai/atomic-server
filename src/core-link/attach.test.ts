import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { confirmDaemonStart } from './attach.js'
import { writeDaemonRecord } from './daemon-record.js'
import type { DaemonRecord } from './daemon-record.js'

const record: DaemonRecord = {
  schema_version: 1,
  pid: 4242,
  instance_id: 'one',
  state: 'starting',
  atc_version: '0.1.0',
  core_version: '0.13.6',
  control_url: 'http://127.0.0.1:1',
  admin_url: null,
  started_at: 0,
}

async function folder() {
  const dir = await mkdtemp(join(tmpdir(), 'atc-attach-'))
  return {
    dir,
    paths: {
      daemonRecord: join(dir, 'daemon.json'),
      daemonOutLog: join(dir, 'daemon.out.log'),
      daemonLog: join(dir, 'daemon.log'),
    },
  }
}

it('reports the log of a spawned daemon that exits before it is ready', async () => {
  const { dir, paths } = await folder()
  try {
    await writeDaemonRecord(paths.daemonRecord, record)
    await writeFile(
      paths.daemonOutLog,
      'error: The admin could not listen on 127.0.0.1:1338.\n  the port is in use [ATC_ADMIN_BIND_FAILED]\n'
    )
    await expect(confirmDaemonStart(paths, record, () => false)).rejects.toMatchObject({
      code: 'ATC_DAEMON_START_FAILED',
      details: expect.stringContaining('the port is in use'),
      hint: 'see `atc logs`',
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it('returns once the daemon says ready, and after the wait when a live daemon is slow', async () => {
  const { dir, paths } = await folder()
  try {
    await writeDaemonRecord(paths.daemonRecord, { ...record, state: 'ready' })
    await expect(confirmDaemonStart(paths, record, () => false)).resolves.toBeUndefined()
    await writeDaemonRecord(paths.daemonRecord, record)
    await expect(confirmDaemonStart(paths, record, () => true, 50)).resolves.toBeUndefined()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
