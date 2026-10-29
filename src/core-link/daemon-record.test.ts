import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readDaemonRecord, removeDaemonRecord, writeDaemonRecord } from './daemon-record.js'
import type { DaemonRecord } from './daemon-record.js'

const dir = mkdtempSync(join(tmpdir(), 'atc-rec-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const record: DaemonRecord = {
  schema_version: 1,
  pid: 1,
  instance_id: 'i1',
  state: 'ready',
  atc_version: '0',
  core_version: '0',
  control_url: 'http://x',
  admin_url: null,
  started_at: 0,
}

describe('daemon record', () => {
  it('round-trips and only removes its own', async () => {
    const path = join(dir, 'run', 'daemon.json')
    await writeDaemonRecord(path, record)
    expect(await readDaemonRecord(path)).toEqual(record)
    await removeDaemonRecord(path, 'other')
    expect(await readDaemonRecord(path)).toEqual(record)
    await removeDaemonRecord(path, 'i1')
    expect(await readDaemonRecord(path)).toBeUndefined()
    expect(await readDaemonRecord(join(dir, 'missing'))).toBeUndefined()
  })

  it('does not delete a record it cannot read', async () => {
    const blocked = join(dir, 'blocked-dir')
    mkdirSync(blocked)
    await removeDaemonRecord(blocked, 'i1')
    expect(existsSync(blocked)).toBe(true)

    const corrupt = join(dir, 'corrupt.json')
    writeFileSync(corrupt, '{')
    await removeDaemonRecord(corrupt, 'i1')
    expect(existsSync(corrupt)).toBe(true)
  })

  it('reads a starting record and defaults older records to ready', async () => {
    const path = join(dir, 'run', 'starting.json')
    await writeDaemonRecord(path, { ...record, state: 'starting' })
    expect((await readDaemonRecord(path))?.state).toBe('starting')
    const { state: _dropped, ...legacy } = record
    await writeDaemonRecord(path, legacy as DaemonRecord)
    expect((await readDaemonRecord(path))?.state).toBe('ready')
  })
})

// Clients read the record every 100 ms while the server starts; on Windows the server's rename over it
// then fails for a moment with EPERM. The write retries instead of failing the start.
it('writes the record over a reader Windows still has open', async () => {
  const { mkdtemp, rename, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'atc-record-'))
  try {
    let refusals = 2
    let attempts = 0
    const path = join(dir, 'daemon.json')
    const record = { schema_version: 1, pid: 1, instance_id: 'i', state: 'ready' } as never
    await writeDaemonRecord(path, record, {
      rename: async (from, to) => {
        attempts++
        if (refusals-- > 0) throw Object.assign(new Error('EPERM'), { code: 'EPERM' })
        await rename(from, to)
      },
    })
    expect(attempts).toBe(3)
    expect(await readDaemonRecord(path)).toMatchObject({ instance_id: 'i', state: 'ready' })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
