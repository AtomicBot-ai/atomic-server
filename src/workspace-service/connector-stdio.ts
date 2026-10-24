import { spawn } from 'node:child_process'
import type { ConnectorConfig } from '../contract/index.js'
import { object } from './validation.js'
/** The child receives only the environment explicitly supplied to the connector service. */
export function connectorStdio(config: ConnectorConfig, env: NodeJS.ProcessEnv) {
  const child = spawn(config.command, config.args, {
    env: { ...env, ...config.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  })
  let sequence = 0,
    buffer = '',
    closed: Error | undefined
  let terminate: ReturnType<typeof setTimeout> | undefined
  let kill: ReturnType<typeof setTimeout> | undefined
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  const fail = (error: Error) => {
    closed ??= error
    for (const item of pending.values()) {
      clearTimeout(item.timer)
      item.reject(error)
    }
    pending.clear()
  }
  const close = () => {
    fail(new Error('Connector connection closed.'))
    child.stdin.end()
    if (child.exitCode !== null || child.signalCode !== null || terminate) return
    terminate = setTimeout(() => child.kill('SIGTERM'), 300)
    kill = setTimeout(() => child.kill('SIGKILL'), 1000)
    terminate.unref()
    kill.unref()
  }
  child.on('error', fail)
  child.stdin.on('error', fail)
  child.on('exit', (code) => {
    clearTimeout(terminate)
    clearTimeout(kill)
    // Connector stderr can contain credentials; it is never copied into shared UI status.
    fail(new Error(`Connector exited (${code ?? 'signal'}).`))
  })
  child.stderr.resume()
  child.stdout.on('data', (chunk) => {
    buffer += String(chunk)
    if (buffer.length > 4 * 1024 * 1024) {
      fail(new Error('Connector response exceeds 4 MB.'))
      close()
      return
    }
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const message = object(JSON.parse(line)),
          item = pending.get(Number(message['id']))
        if (message['method'] || !item) continue
        if (message['jsonrpc'] !== '2.0' || (!('result' in message) && !('error' in message)))
          throw new Error('Connector returned an invalid response.')
        clearTimeout(item.timer)
        pending.delete(Number(message['id']))
        if (message['error'])
          item.reject(new Error(String(object(message['error'])['message'] ?? 'MCP request failed.')))
        else item.resolve(message['result'])
      } catch (error) {
        fail(
          error instanceof SyntaxError
            ? new Error('Connector wrote invalid JSON to stdout.')
            : (error as Error)
        )
        close()
      }
    }
  })
  return {
    async send(method: string, params?: unknown, notification = false): Promise<unknown> {
      if (closed) throw closed
      const id = ++sequence,
        payload =
          JSON.stringify({
            jsonrpc: '2.0',
            ...(!notification ? { id } : {}),
            method,
            ...(params ? { params } : {}),
          }) + '\n'
      if (notification) {
        child.stdin.write(payload)
        return undefined
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          fail(new Error('Connector request timed out.'))
          close()
        }, config.timeout * 1000)
        pending.set(id, { resolve, reject, timer })
        child.stdin.write(payload)
      })
    },
    close,
  }
}
