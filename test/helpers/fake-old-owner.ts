/**
 * A stand-in for a server another `atc` build left running: a hand-written `instance.lock` with
 * another core version, the control token, and a loopback HTTP server answering the two control
 * routes `stale-owner.ts` uses. The lock names this test process (alive, `process_start_id: null`),
 * which the core counts as owned. `shutdown` removes the lock, as a real owner does on exit.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname } from 'node:path'
import { writeControlToken } from '@atomic-chat/core/host'
import type { AtcPaths } from '../../src/config/index.js'
import { writeDaemonRecord } from '../../src/core-link/index.js'

export interface FakeOldOwner {
  instanceId: string
  shutdowns: Array<{ force?: boolean; client_id?: string }>
  close: () => Promise<void>
}

export async function fakeOldOwner(
  paths: AtcPaths,
  options: {
    version?: string
    protocol?: number
    clients?: string[]
    /** What the snapshot reports as its instance; defaults to the lock's. */
    snapshotInstanceId?: string
    /** Keep the lock on shutdown, as a server that hangs would. */
    ignoreShutdown?: boolean
    atcRecord?: boolean
  } = {}
): Promise<FakeOldOwner> {
  const instanceId = 'old-instance'
  const lockPath = paths.layout.core.instanceLock
  mkdirSync(dirname(lockPath), { recursive: true })
  const token = await writeControlToken(paths.layout)
  const shutdowns: FakeOldOwner['shutdowns'] = []
  const server = createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end()
      return
    }
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      if (req.method === 'GET' && req.url === '/atomic/v1/snapshot') {
        res.end(
          JSON.stringify({
            instance_id: options.snapshotInstanceId ?? instanceId,
            owner_scope: 'cli',
            protocol: options.protocol ?? 2,
            version: options.version ?? '0.0.1',
            pid: process.pid,
            clients: (options.clients ?? []).map((name, i) => ({ id: `c${i}`, name, pid: process.pid })),
            sessions: [],
          })
        )
        return
      }
      if (req.method === 'POST' && req.url === '/atomic/v1/shutdown') {
        shutdowns.push(body ? JSON.parse(body) : {})
        if (!options.ignoreShutdown) rmSync(lockPath, { force: true })
        res.end(JSON.stringify({ ok: true, stopping: true }))
        return
      }
      res.writeHead(404).end('{}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  writeFileSync(
    lockPath,
    JSON.stringify({
      instance_id: instanceId,
      owner_scope: 'cli',
      pid: process.pid,
      process_start_id: null,
      protocol: options.protocol ?? 2,
      version: options.version ?? '0.0.1',
      data_folder: paths.dataFolder,
      control_host: '127.0.0.1',
      control_port: port,
      state: 'ready',
      acquired_at: new Date().toISOString(),
    })
  )
  if (options.atcRecord !== false) {
    await writeDaemonRecord(paths.daemonRecord, {
      schema_version: 1,
      pid: process.pid,
      instance_id: instanceId,
      state: 'ready',
      atc_version: '0.0.9',
      core_version: options.version ?? '0.0.1',
      control_url: `http://127.0.0.1:${port}`,
      admin_url: null,
      started_at: Date.now(),
    })
  }
  return {
    instanceId,
    shutdowns,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
