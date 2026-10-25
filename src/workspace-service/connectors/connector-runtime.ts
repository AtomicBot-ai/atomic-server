/**
 * Connectors as this server runs them: the status of each (checking, connected, error, with its tools),
 * a check or a tool call through `withConnector`, and the OAuth sign-in of HTTP connectors. Statuses live
 * in memory; the features document holds the connectors themselves.
 */
import type { ConnectorConfig, ConnectorStatus, WorkspaceInput } from '../../contract/index.js'
import { AtcError } from '../../errors/index.js'
import { object } from '../validation.js'
import { withConnector } from './connector-client.js'
import { ConnectorOAuth } from './connector-oauth.js'

export class ConnectorRuntime {
  private readonly oauth: ConnectorOAuth
  private states: Record<string, ConnectorStatus> = {}
  constructor(
    atcDir: string,
    private readonly request: typeof fetch,
    private readonly env: NodeJS.ProcessEnv
  ) {
    this.oauth = new ConnectorOAuth(atcDir, request)
  }
  statuses(): Record<string, ConnectorStatus> {
    return structuredClone(this.states)
  }
  forget(ids: string[]) {
    for (const id of ids) delete this.states[id]
  }
  reset() {
    this.states = {}
  }
  async revoke(ids: string[]) {
    for (const id of ids) await this.oauth.logout(id)
  }
  /** `connectors.oauth.start|cancel|logout|status` for an HTTP connector. */
  signIn(operation: string, connector: ConnectorConfig | undefined, input: WorkspaceInput) {
    if (!connector || connector.type === 'stdio') throw new AtcError('ATC_USAGE', 'Choose an HTTP connector.')
    const id = connector.id
    if (operation === 'connectors.oauth.start')
      return this.oauth.start(id, connector.url, input['client_id'] as string | undefined)
    if (operation === 'connectors.oauth.cancel') return this.oauth.cancel(id)
    if (operation === 'connectors.oauth.logout') return this.oauth.logout(id)
    return this.oauth.status(id)
  }
  /** `connectors.check` or `connectors.call`. */
  async connect(operation: string, connector: ConnectorConfig | undefined, input: WorkspaceInput) {
    if (!connector) throw new AtcError('ATC_USAGE', 'This connector no longer exists.')
    const id = connector.id
    this.states[id] = { state: 'checking', tools: this.states[id]?.tools ?? [] }
    try {
      const authorization =
        connector.type !== 'stdio' ? await this.oauth.header(id, connector.url) : undefined
      const configured = authorization
        ? { ...connector, headers: { ...connector.headers, Authorization: authorization } }
        : connector
      return await withConnector(configured, this.request, this.env, async (client, tools) => {
        this.states[id] = { state: 'connected', tools, checked_at: Date.now() }
        if (operation === 'connectors.check') return this.states[id]
        if (!tools.some((t) => t.name === input['tool']))
          throw new AtcError('ATC_USAGE', 'Choose an available connector tool.')
        return client.send('tools/call', { name: input['tool'], arguments: object(input['arguments']) })
      })
    } catch (error) {
      // A tool that failed, or a wrong tool name, does not make a connected connector broken.
      if (this.states[id]?.state !== 'connected')
        this.states[id] = {
          state: 'error',
          tools: [],
          error: error instanceof Error ? error.message : String(error),
          checked_at: Date.now(),
        }
      throw error
    }
  }
}
