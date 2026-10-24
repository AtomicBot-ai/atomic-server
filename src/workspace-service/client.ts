import { AtomicCoreError } from '@atomic-chat/core'
import type { ErrorBody as CoreErrorBody } from '@atomic-chat/core'
import { readFile } from 'node:fs/promises'
import { patientFetch, readDaemonRecord, waitForDaemonReady } from '../core-link/index.js'
import { AtcError, ATC_ERROR_CODES } from '../errors/index.js'
import type { AtcErrorCode } from '../errors/index.js'
import type { WorkspaceInput, WorkspaceSnapshot } from '../contract/index.js'
import { WorkspaceService } from './service.js'
import type { WorkspaceServiceOptions } from './service.js'
import { object } from './validation.js'
export interface WorkspaceClient {
  snapshot(): Promise<WorkspaceSnapshot>
  execute(operation: string, input?: WorkspaceInput): Promise<unknown>
}
/** Daemon-owned jobs survive terminal/browser exits. The token never leaves the loopback listener. */
export async function createWorkspaceClient(options: WorkspaceServiceOptions): Promise<WorkspaceClient> {
  let record = await readDaemonRecord(options.paths.daemonRecord)
  // A server still starting has no admin yet: wait for it rather than settle on a service in this
  // process, which a caller would then keep for the server's whole life.
  if (record?.instance_id === options.link.endpoint.instanceId && record.state === 'starting') {
    record = await waitForDaemonReady(options.paths.daemonRecord, record.instance_id)
    if (record?.state === 'starting')
      throw new AtcError('ATC_DAEMON_START_FAILED', 'The server did not finish starting.', {
        hint: 'see `atc logs`',
      })
  }
  if (record?.instance_id === options.link.endpoint.instanceId && record.admin_url) {
    const url = new URL(record.admin_url)
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw new AtcError('ATC_USAGE', 'The admin address must be local.')
    const token = (await readFile(options.paths.adminToken, 'utf8')).trim()
    const call = async (path: string, body?: unknown) => {
      // Its own 15-minute signal ends a call, not the runtime's 300 s (a long load, a prepare).
      const response = await patientFetch(options.fetch ?? fetch)(`${url.origin}${path}`, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-atc-admin': '1',
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(900000),
      })
      const result = await response.json()
      if (!response.ok) {
        const error = object(object(result)['error'])
        const code = String(error['code'] ?? 'ATC_INTERNAL'),
          message = String(error['message'] ?? `Admin returned HTTP ${response.status}.`),
          details = typeof error['details'] === 'string' ? error['details'] : undefined,
          hint = typeof error['hint'] === 'string' ? error['hint'] : undefined
        if (ATC_ERROR_CODES.includes(code as AtcErrorCode))
          throw new AtcError(code as AtcErrorCode, message, {
            ...(details ? { details } : {}),
            ...(hint ? { hint } : {}),
          })
        throw AtomicCoreError.fromBody({
          code: code as CoreErrorBody['code'],
          message,
          ...(details ? { details } : {}),
        })
      }
      return result
    }
    return {
      snapshot: async () => (await call('/api/workspace')) as WorkspaceSnapshot,
      execute: (operation, input = {}) => call('/api/workspace/execute', { operation, input }),
    }
  }
  const service = new WorkspaceService(options)
  return {
    snapshot: () => service.snapshot(),
    execute: async (operation, input = {}) => {
      // Downloads run in the server process; this one may exit before they finish.
      if (
        [
          'engines.enqueue',
          'engines.retry',
          'artifacts.install',
          'artifacts.resume',
          'models.install',
          'setup.resume',
          'managed.install',
          'foundry.install',
        ].includes(operation)
      )
        throw new AtcError('ATC_USAGE', 'Enable the web admin before downloading engines or models.', {
          hint: 'atc config set admin.autoStart true, then restart the server.',
        })
      return service.execute(operation, input)
    },
  }
}
