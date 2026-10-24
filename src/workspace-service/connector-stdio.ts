import { spawn } from 'node:child_process'
import type { ConnectorConfig } from '../contract/index.js'
import { object } from './validation.js'
import { AtcError } from '../errors/index.js'
/**
 * What a program needs from the server's environment to start at all (finding executables, a home and
 * temporary folder, the locale, Windows' system folders and processor, the XDG folders) and to reach the
 * network as the server does (its proxy and certificate authorities, which `npx` connectors need to fetch
 * their package), by name in any case. Nothing else of the server's environment — `HF_TOKEN`,
 * `ATC_API_KEY`, cloud keys — reaches a connector; its own `env` is added on top.
 */
const HOST_BASICS = new Set([
  'PATH',
  'PATHEXT',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'COMSPEC',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PROGRAMFILES',
  'HOMEDRIVE',
  'HOMEPATH',
  'PROGRAMFILES(X86)',
  'COMMONPROGRAMFILES',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'OS',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'XDG_RUNTIME_DIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
])
const connectorEnv = (env: NodeJS.ProcessEnv, own: Record<string, string>): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(env).filter(([name]) => HOST_BASICS.has(name.toUpperCase()))),
  ...own,
})

/** A stdio connector: the server's host basics and the connector's own environment, nothing more. */
export function connectorStdio(config: ConnectorConfig, env: NodeJS.ProcessEnv) {
  const child = spawn(config.command, config.args, {
    env: connectorEnv(env, config.env),
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
    fail(new AtcError('ATC_USAGE', 'Connector connection closed.'))
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
    fail(new AtcError('ATC_USAGE', `Connector exited (${code ?? 'signal'}).`))
  })
  child.stderr.resume()
  child.stdout.on('data', (chunk) => {
    buffer += String(chunk)
    if (buffer.length > 4 * 1024 * 1024) {
      fail(new AtcError('ATC_USAGE', 'Connector response exceeds 4 MB.'))
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
          throw new AtcError('ATC_USAGE', 'Connector returned an invalid response.')
        clearTimeout(item.timer)
        pending.delete(Number(message['id']))
        if (message['error'])
          item.reject(
            new AtcError('ATC_USAGE', String(object(message['error'])['message'] ?? 'MCP request failed.'))
          )
        else item.resolve(message['result'])
      } catch (error) {
        fail(
          error instanceof SyntaxError
            ? new AtcError('ATC_USAGE', 'Connector wrote invalid JSON to stdout.')
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
          fail(new AtcError('ATC_USAGE', 'Connector request timed out.'))
          close()
        }, config.timeout * 1000)
        pending.set(id, { resolve, reject, timer })
        child.stdin.write(payload)
      })
    },
    close,
  }
}
