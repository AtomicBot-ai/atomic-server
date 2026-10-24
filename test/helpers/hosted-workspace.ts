/** In-process admin transport for TUI tests: server jobs belong to a separate service instance. */
import { mkdirSync, writeFileSync } from 'node:fs'
import type { AtcPaths } from '../../src/config/index.js'
import { defaultConfig } from '../../src/config/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import type { FakeCoreLink } from './fake-core-link.js'
export function hostedWorkspace(paths: AtcPaths, link: FakeCoreLink, fallback: typeof fetch) {
  mkdirSync(paths.runDir, { recursive: true })
  writeFileSync(
    paths.daemonRecord,
    JSON.stringify({
      schema_version: 1,
      instance_id: link.endpoint.instanceId,
      pid: 4242,
      state: 'ready',
      admin_url: 'http://127.0.0.1:15555',
    })
  )
  writeFileSync(paths.adminToken, 'isolated-test-token')
  const service = new WorkspaceService({ paths, link, config: defaultConfig(), fetch: fallback })
  const emit = link.emit
  link.emit = (message) => {
    service.event(message.event, message.data)
    emit(message)
  }
  const request: typeof fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/api/workspace')) return Response.json(await service.snapshot())
    if (url.endsWith('/api/workspace/execute')) {
      const { operation, input: values } = JSON.parse(String(init?.body))
      try {
        return Response.json((await service.execute(operation, values)) ?? null)
      } catch (error) {
        return Response.json({ error: { code: 'ATC_INTERNAL', message: String(error) } }, { status: 400 })
      }
    }
    return fallback(input, init)
  }
  return request
}
