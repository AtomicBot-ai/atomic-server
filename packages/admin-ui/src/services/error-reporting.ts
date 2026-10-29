import { ADMIN_API, ADMIN_HEADER, CLIENT_ERROR_NAMES } from '@contract'
import type { ClientFailure, ClientFailureKind } from '@contract'
import { AdminApiError } from './admin-error'

const FRAME = /(?:\s+at\s+)(?:([\w.$<>]+)\s+\()?https?:\/\/[^/\s]+(\/assets\/[\w.-]+\.js:\d{1,9}:\d{1,9})\)?$/

export function createBrowserReporter(send: (body: ClientFailure) => Promise<unknown>) {
  const seen = new WeakSet<object>()
  let start = Date.now(),
    count = 0
  const capture = (error: unknown, kind: ClientFailureKind) => {
    if (error instanceof AdminApiError || (error as Error | undefined)?.name === 'AbortError') return
    if (error && typeof error === 'object') {
      if (seen.has(error)) return
      seen.add(error)
    }
    const now = Date.now()
    if (now - start >= 60_000) {
      start = now
      count = 0
    }
    if (++count > 10) return
    const name =
      error instanceof Error && CLIENT_ERROR_NAMES.includes(error.name as ClientFailure['name'])
        ? (error.name as ClientFailure['name'])
        : 'Error'
    const frames = (error instanceof Error ? (error.stack ?? '') : '')
      .split('\n')
      .slice(1)
      .flatMap((line) => {
        const frame = FRAME.exec(line)
        return frame ? [`    at ${frame[1] ? `${frame[1]} (${frame[2]})` : frame[2]}`] : []
      })
      .slice(0, 30)
    // No message, URL, token, request body, component props or arbitrary context enters this payload.
    try {
      void send({ kind, name, frames }).catch(() => {})
    } catch {
      /* No recursive reporting. */
    }
  }
  return {
    capture,
    install(target: Window) {
      const error = (event: ErrorEvent) => capture(event.error, 'error')
      const rejection = (event: PromiseRejectionEvent) => capture(event.reason, 'unhandled_rejection')
      target.addEventListener('error', error)
      target.addEventListener('unhandledrejection', rejection)
      return () => {
        target.removeEventListener('error', error)
        target.removeEventListener('unhandledrejection', rejection)
      }
    },
  }
}

const reporter = createBrowserReporter(async (body) => {
  await fetch(ADMIN_API.clientReports, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { [ADMIN_HEADER]: '1', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2000),
  })
})
export const reportClientFailure = (error: unknown) => reporter.capture(error, 'action')
export const reportReactFailure = (error: unknown) => reporter.capture(error, 'react')
export const installBrowserReporting = () => reporter.install(window)
