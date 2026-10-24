/**
 * The admin API behind the SPA. It holds the daemon's own core link, so the control token stays
 * in this process; the browser only ever has its session cookie. Every route is explicit or on a
 * short allowlist of the control API — `/shutdown`, `/clients`, telemetry consent and cloud keys
 * are never reachable from a page.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { AtomicCoreError } from '@atomic-chat/core'
import type { CoreLink } from '../core-link/index.js'
import { AtcError, errorBody } from '../errors/index.js'
import type { Logger } from '../output/index.js'
import { clearedSessionCookie, parseCookies, sessionCookie } from './auth.js'
import type { SessionStore } from './auth.js'
import { ADMIN_API, SESSION_COOKIE } from '../contract/index.js'
import type { AdminConfigView, AdminStatus } from '../contract/index.js'
import { gateRequest } from './gates.js'
import { sseFrame } from './relay.js'
import type { RelayHub } from './relay.js'
import { tokensMatch } from './token.js'
import { sanitizeWorkspaceData } from '../workspace-service/index.js'
import { adminFailureReport, captureReport, type ErrorSink } from '../telemetry/index.js'
import type { WorkspaceClient } from '../workspace-service/index.js'
import { serveWorkspaceAsset } from './workspace-assets.js'

export const MAX_BODY_BYTES = 8 * 1024 * 1024
export const SSE_PING_MS = 15_000

/** Control routes a page may read. Prefix match on the path after `/api/core`. */
export const READ_ALLOW = [
  '/health',
  '/snapshot',
  '/sessions',
  '/server',
  '/backends',
  '/hardware',
  '/environments',
  '/settings',
  '/telemetry',
]
/**
 * Control routes a page may change, exactly: `:name` is one path segment, `*name` one or more (model
 * ids contain slashes). Nothing a page does not need: not the settings import and acknowledge routes
 * (the desktop app's migration), and never `host-step-result`, whose only writer is the daemon.
 */
export const WRITE_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['POST', '/models/:provider/*model/load'],
  ['POST', '/models/:provider/*model/load/cancel'],
  ['POST', '/models/:provider/*model/unload'],
  ['POST', '/models/:provider/check'],
  ['POST', '/models/compatibility'],
  ['POST', '/server/start'],
  ['POST', '/server/stop'],
  ['PUT', '/server/inspector'],
  ['POST', '/backends/:provider/catalog'],
  ['POST', '/backends/:provider/install'],
  ['POST', '/backends/:provider/recommendation'],
  ['POST', '/backends/:provider/updates'],
  ['PUT', '/backends/:provider/optimal'],
  ['DELETE', '/backends/:provider/:version/:backend'],
  ['DELETE', '/hardware/override'],
  ['PATCH', '/settings/:provider'],
  ['POST', '/environments/probe'],
  ['POST', '/environments/:environment/operations'],
  ['POST', '/environments/:environment/reset'],
  ['POST', '/environments/operations/:operation/cancel'],
  ['POST', '/environments/operations/:operation/resume'],
  ['POST', '/downloads/*task/cancel'],
  ['POST', '/disk/available'],
  ['POST', '/gguf/validate'],
]

function routePattern(route: string): RegExp {
  const body = route
    .split('/')
    .map((part) =>
      part.startsWith(':')
        ? '[^/]+'
        : part.startsWith('*')
          ? '[^/]+(?:/[^/]+)*'
          : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('/')
  return new RegExp(`^${body}$`)
}

const WRITE_PATTERNS = WRITE_ROUTES.map(([method, route]) => [method, routePattern(route)] as const)

export function proxyAllowed(method: string, path: string): boolean {
  if (method === 'GET') return READ_ALLOW.some((p) => path === p || path.startsWith(`${p}/`))
  return WRITE_PATTERNS.some(([m, pattern]) => m === method && pattern.test(path))
}

export interface BffDeps {
  link: CoreLink
  relay: RelayHub
  sessions: SessionStore
  adminToken: () => Promise<string>
  status: () => Promise<AdminStatus>
  config: () => Promise<AdminConfigView>
  log: Logger
  loopbackOnly: boolean
  pingMs?: number
  workspace?: WorkspaceClient
  /** atc's own error reports: a bug behind this API goes there. */
  errors?: ErrorSink
}

type Req = IncomingMessage
type Res = ServerResponse

function send(res: Res, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(text)),
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(text)
}

function sendError(res: Res, status: number, error: unknown, headers: Record<string, string> = {}): void {
  send(res, status, { error: errorBody(error) }, headers)
}

function statusFor(error: unknown): number {
  if (error instanceof AtcError)
    return error.code === 'ATC_NOT_IMPLEMENTED' ? 501 : error.code === 'ATC_USAGE' ? 400 : 500
  if (error instanceof AtomicCoreError) {
    if (error.code.endsWith('NOT_FOUND')) return 404
    if (error.code.startsWith('CORE_')) return 502
    return 400
  }
  return 500
}

async function readJson(req: Req, limit = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) throw new AtcError('ATC_USAGE', 'Request body too large.')
    chunks.push(chunk as Buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new AtcError('ATC_USAGE', 'Request body is not valid JSON.')
  }
}

/** Handle `/api/*`; answers `false` for anything else so the caller can serve the SPA. */
export function createBffHandler(deps: BffDeps): (req: Req, res: Res) => Promise<boolean> {
  const notImplemented = (what: string, planned: string) =>
    new AtcError('ATC_NOT_IMPLEMENTED', `${what} is not implemented yet.`, {
      details: `planned for ${planned}`,
    })

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://atc.local')
    const path = url.pathname
    if (!path.startsWith('/api/')) return false
    const method = req.method ?? 'GET'
    try {
      const gate = gateRequest(req, { loopbackOnly: deps.loopbackOnly })
      if (!gate.ok) {
        sendError(res, gate.status, new AtcError('ATC_ADMIN_UNAUTHORIZED', gate.reason ?? 'refused'))
        return true
      }
      if (path === ADMIN_API.session) {
        if (method === 'POST') {
          const body = (await readJson(req)) as { token?: unknown } | undefined
          const presented = typeof body?.token === 'string' ? body.token : undefined
          if (!tokensMatch(presented, await deps.adminToken())) {
            deps.log.warn('admin login refused: bad token')
            sendError(
              res,
              401,
              new AtcError('ATC_ADMIN_UNAUTHORIZED', 'Bad admin token.', {
                hint: 'open the URL printed by `atc admin`',
              })
            )
            return true
          }
          send(res, 204, undefined, { 'set-cookie': sessionCookie(deps.sessions.create()) })
          return true
        }
        if (method === 'DELETE') {
          send(res, 204, undefined, { 'set-cookie': clearedSessionCookie() })
          return true
        }
        send(res, 405, { error: { code: 'ATC_USAGE', message: 'method not allowed' } })
        return true
      }
      const cookie = parseCookies(req.headers.cookie)[SESSION_COOKIE]
      const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1]
      const authorised =
        deps.sessions.validate(cookie) ||
        (bearer !== undefined && tokensMatch(bearer, await deps.adminToken()))
      if (!authorised) {
        sendError(
          res,
          401,
          new AtcError('ATC_ADMIN_UNAUTHORIZED', 'Sign in first.', {
            hint: 'open the URL printed by `atc admin`, or send the admin token as a Bearer',
          })
        )
        return true
      }
      if (path === ADMIN_API.workspace && method === 'GET') {
        if (!deps.workspace) throw notImplemented('Workspace operations', 'a workspace-enabled server')
        send(res, 200, await deps.workspace.snapshot())
        return true
      }
      if (path === ADMIN_API.workspaceExecute && method === 'POST') {
        if (!deps.workspace) throw notImplemented('Workspace operations', 'a workspace-enabled server')
        const body = (await readJson(req, 140 * 1024 * 1024)) as { operation?: unknown; input?: unknown }
        if (typeof body?.operation !== 'string') throw new AtcError('ATC_USAGE', 'Choose an operation.')
        send(
          res,
          200,
          await deps.workspace.execute(body.operation, (body.input ?? {}) as Record<string, unknown>)
        )
        return true
      }
      const asset = /^\/api\/workspace\/artifacts\/(image|video)\/([^/]+)$/.exec(path)
      if (asset && (method === 'GET' || method === 'HEAD')) {
        await serveWorkspaceAsset(deps.link, req, res, asset[1]!, asset[2]!)
        return true
      }
      if (path === ADMIN_API.status && method === 'GET') {
        send(res, 200, sanitizeWorkspaceData(await deps.status()))
        return true
      }
      if (path === ADMIN_API.config) {
        if (method === 'GET') {
          send(res, 200, await deps.config())
          return true
        }
        throw notImplemented('Editing the config from the admin', 'iteration 5')
      }
      if (path === ADMIN_API.events && method === 'GET') {
        serveEvents(req, res, deps)
        return true
      }
      if (path.startsWith(`${ADMIN_API.core}/`)) {
        const target = path.slice(ADMIN_API.core.length)
        if (!proxyAllowed(method, target)) {
          sendError(
            res,
            403,
            new AtcError('ATC_ADMIN_UNAUTHORIZED', `${method} ${target} is not reachable from the admin.`)
          )
          return true
        }
        const body = method === 'GET' ? undefined : await readJson(req)
        const result = await deps.link.request<unknown>(method as 'GET', `${target}${url.search}`, body)
        send(res, 200, sanitizeWorkspaceData(result ?? {}))
        return true
      }
      if (path.startsWith(`${ADMIN_API.setup}/`) || path === ADMIN_API.setup)
        throw notImplemented('The setup wizard API', 'iteration 7')
      if (path === ADMIN_API.logs) throw notImplemented('The log API', 'iteration 7')
      if (/^\/api\/engines\/[^/]+\/schema$/.test(path))
        throw notImplemented('Engine settings schemas', 'iteration 5')
      sendError(res, 404, new AtcError('ATC_USAGE', `No such admin route: ${method} ${path}`))
      return true
    } catch (error) {
      const status = statusFor(error)
      if (status >= 500 && status !== 501) deps.log.error(`admin ${method} ${path} failed: ${String(error)}`)
      captureReport(deps.errors, adminFailureReport({ error, status, method, path }))
      sendError(res, status, error)
      return true
    }
  }
}

function serveEvents(req: Req, res: Res, deps: BffDeps): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    'connection': 'keep-alive',
    'x-accel-buffering': 'no',
  })
  res.write(': connected\n\n')
  const lastId = req.headers['last-event-id']
  for (const event of deps.relay.replayAfter(typeof lastId === 'string' ? lastId : undefined))
    res.write(sseFrame(event))
  const off = deps.relay.subscribe((event) => res.write(sseFrame(event)))
  const ping = setInterval(() => res.write(': ping\n\n'), deps.pingMs ?? SSE_PING_MS)
  const close = () => {
    clearInterval(ping)
    off()
  }
  req.on('close', close)
  res.on('close', close)
}
