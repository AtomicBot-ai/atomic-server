/**
 * A running server's workspace for command tests: a real `WorkspaceService` behind the two admin routes
 * a command calls (`GET /api/workspace`, `POST /api/workspace/execute`), on loopback, with the daemon
 * record and the admin token a command finds. Work it starts (a download) goes on after the command
 * returns, as in the daemon. The fake core link is the test's.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { dirname } from 'node:path'
import { defaultConfig } from '../../src/config/index.js'
import type { AtcPaths } from '../../src/config/index.js'
import { writeDaemonRecord } from '../../src/core-link/index.js'
import { errorBody } from '../../src/errors/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import type { FakeCoreLink } from './fake-core-link.js'

export async function workspaceServer(
  link: FakeCoreLink,
  paths: AtcPaths,
  env: Record<string, string | undefined> = {},
  /** Where `https://huggingface.co` is served instead, for the code that does not read `HF_ENDPOINT`. */
  hub?: string
): Promise<{ service: WorkspaceService; close(): Promise<void> }> {
  const request: typeof fetch = (input, init) =>
    fetch(
      hub
        ? String(input instanceof Request ? input.url : input).replace('https://huggingface.co', hub)
        : input,
      init
    )
  const service = new WorkspaceService({ link, paths, config: defaultConfig(), env, fetch: request })
  const server: Server = createServer((req, res) => {
    const reply = (status: number, value: unknown) =>
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value))
    if (req.headers.authorization !== 'Bearer test-token')
      return reply(401, { error: { code: 'ATC_ADMIN_UNAUTHORIZED', message: 'no' } })
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      const run = async () => {
        if (req.url === '/api/workspace') return service.snapshot()
        const { operation, input } = JSON.parse(body) as { operation: string; input: Record<string, unknown> }
        return service.execute(operation, input)
      }
      run().then(
        (value) => reply(200, value ?? null),
        (error: unknown) => reply(400, { error: errorBody(error) })
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  mkdirSync(dirname(paths.adminToken), { recursive: true })
  writeFileSync(paths.adminToken, 'test-token')
  await writeDaemonRecord(paths.daemonRecord, {
    schema_version: 1,
    pid: link.endpoint.pid,
    instance_id: link.endpoint.instanceId,
    state: 'ready',
    atc_version: 'test',
    core_version: link.endpoint.version,
    control_url: link.endpoint.baseUrl,
    admin_url: `http://127.0.0.1:${port}`,
    started_at: 0,
  })
  return {
    service,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
