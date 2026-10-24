import type { ConnectorConfig } from '../contract/index.js'
import { object } from './validation.js'
/** Compatibility transport for desktop catalog connectors which still expose HTTP+SSE. */
export function connectorSse(config: ConnectorConfig, request: typeof fetch) {
  const controller = new AbortController()
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  let sequence = 0,
    endpoint = '',
    closed: Error | undefined
  const fail = (error: Error) => {
    closed ??= error
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(error)
    }
    pending.clear()
  }
  let readyResolve!: () => void, readyReject!: (error: Error) => void
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  void ready.catch(() => {})
  // Only discovery has a connection deadline. Each later request owns its own timeout.
  const opening = setTimeout(
    () => controller.abort(new Error('Connector connection timed out.')),
    config.timeout * 1000
  )
  void (async () => {
    try {
      const response = await request(config.url, {
        redirect: 'error',
        headers: { ...config.headers, Accept: 'text/event-stream' },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error(`Connector returned HTTP ${response.status}.`)
      const reader = response.body.getReader(),
        decoder = new TextDecoder()
      let buffer = '',
        event = '',
        data = ''
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) throw new Error('Connector event stream closed.')
          buffer += decoder.decode(next.value, { stream: true })
          if (buffer.length + data.length > 4 * 1024 * 1024)
            throw new Error('Connector response exceeds 4 MB.')
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += line.slice(5).trimStart() + '\n'
            else if (!line) {
              if (event === 'endpoint') {
                const url = new URL(data.trim(), config.url)
                if (url.origin !== new URL(config.url).origin || url.username || url.password || url.hash)
                  throw new Error('Connector redirected messages to a different origin.')
                endpoint = url.toString()
                clearTimeout(opening)
                readyResolve()
              } else if (data) {
                const message = object(JSON.parse(data)),
                  item = pending.get(Number(message['id']))
                if (item && !message['method']) {
                  if (message['jsonrpc'] !== '2.0' || (!('result' in message) && !('error' in message)))
                    throw new Error('Connector returned an invalid response.')
                  clearTimeout(item.timer)
                  pending.delete(Number(message['id']))
                  if (message['error'])
                    item.reject(new Error(String(object(message['error'])['message'] ?? 'Tool failed.')))
                  else item.resolve(message['result'])
                }
              }
              event = ''
              data = ''
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    } catch (error) {
      const cause = error instanceof Error ? error : new Error(String(error))
      readyReject(cause)
      fail(cause)
    } finally {
      clearTimeout(opening)
    }
  })()
  return {
    async send(method: string, params?: unknown, notification = false): Promise<unknown> {
      await ready
      if (closed) throw closed
      const id = ++sequence
      const result = notification
        ? Promise.resolve(undefined)
        : new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              pending.delete(id)
              reject(new Error('Connector request timed out.'))
            }, config.timeout * 1000)
            pending.set(id, { resolve, reject, timer })
          })
      const post = (async () => {
        try {
          const response = await request(endpoint, {
            method: 'POST',
            redirect: 'error',
            headers: { ...config.headers, 'Content-Type': 'application/json' },
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(config.timeout * 1000)]),
            body: JSON.stringify({
              jsonrpc: '2.0',
              ...(!notification ? { id } : {}),
              method,
              ...(params ? { params } : {}),
            }),
          })
          await response.body?.cancel()
          if (!response.ok) throw new Error(`Connector returned HTTP ${response.status}.`)
        } catch (error) {
          const item = pending.get(id)
          if (item) {
            clearTimeout(item.timer)
            pending.delete(id)
            item.reject(error as Error)
          }
          throw error
        }
      })()
      // Attach both handlers immediately: a timeout/stream failure can precede the POST response.
      const [value] = await Promise.all([result, post])
      return value
    },
    close() {
      clearTimeout(opening)
      const error = new Error('Connector connection closed.')
      readyReject(error)
      fail(error)
      controller.abort()
    },
  }
}
