import { WorkspaceRuntime } from './runtime.js'
import { dirname } from 'node:path'
import { ClientKeys, ChatHistory } from '../../terminal-data/index.js'
import {
  TerminalSetup,
  installedModels,
  ModelCatalog,
  modelFiles,
  EngineSelection,
  modelProvider,
} from '../../terminal-setup/index.js'
import type { HubRepository } from '../../terminal-setup/index.js'
import { prepareAgent } from '../../agent-launch/index.js'
import type { AgentHost, AgentId } from '../../agent-launch/index.js'
import type { TuiAction } from '../state.js'
import type { TuiDeps } from '../controller.js'
import { TuiController, oneLine } from '../controller.js'
import type { TuiCommand } from '../controller.js'
import { createLogger } from '../../output/index.js'
import { setConfigValue } from '../../config/index.js'
import type { CoreLink } from '../../core-link/index.js'
import {
  listChatModels,
  streamChat,
  startApi,
  requestRow,
  readChatImage,
} from '../../terminal-service/index.js'
import type { ChatMessage, RequestRow } from '../../terminal-service/index.js'
export interface WorkspaceDeps {
  agentHost?: AgentHost
  base: TuiDeps
  request: typeof fetch
  apiKey: string
  chatKey: string
}
export class WorkspaceController {
  readonly runtime: WorkspaceRuntime
  readonly keys: ClientKeys
  readonly history: ChatHistory
  readonly setup: TerminalSetup
  readonly engineSelection: EngineSelection
  private catalog: ModelCatalog
  private legacy: TuiController
  private abort = new AbortController()
  private turn: AbortController | undefined
  private observer: AbortController | undefined
  private instance = ''
  private log = createLogger(() => undefined, { level: 'error' })
  constructor(
    private deps: WorkspaceDeps,
    dispatch: (action: TuiAction) => void,
    private onRequest: (row: RequestRow) => void,
    private onError: (message: string) => void
  ) {
    this.legacy = new TuiController(deps.base, dispatch)
    this.runtime = new WorkspaceRuntime(deps.base, deps.request)
    const directory = dirname(deps.base.paths.configFile)
    this.keys = new ClientKeys(directory)
    this.history = new ChatHistory(directory)
    this.setup = new TerminalSetup(
      directory,
      (launch) => deps.base.attach({ launch, log: this.log }),
      this.runtime
    )
    this.engineSelection = new EngineSelection(directory, () =>
      deps.base.attach({ launch: true, log: this.log })
    )
    this.catalog = new ModelCatalog(directory, deps.request)
  }
  start(): void {
    this.legacy.start()
  }
  dispose(): void {
    this.abort.abort()
    this.observer?.abort()
    this.turn?.abort()
    this.legacy.dispose()
    this.runtime.dispose()
  }
  run(command: TuiCommand): Promise<void> {
    return this.legacy.run(command)
  }
  async save(key: string, raw: string): Promise<void> {
    await setConfigValue(this.deps.base.paths.configFile, await this.deps.base.loadConfig(), key, raw)
  }
  config() {
    return this.deps.base.loadConfig()
  }
  cancel(): void {
    this.turn?.abort()
  }
  async prepareAgent(id: AgentId, endpoint: string, model: string) {
    if (!this.deps.agentHost) throw new Error('Agent handoff is unavailable in this terminal.')
    return prepareAgent(id, endpoint, model, await this.localKey(), this.deps.agentHost)
  }
  async models(endpoint: string, server = false): Promise<string[]> {
    return listChatModels(
      endpoint,
      this.deps.request,
      server ? await this.localKey() : await this.keyFor(endpoint),
      AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)])
    )
  }
  image(path: string) {
    return readChatImage(path)
  }
  installed() {
    return installedModels(this.deps.base.paths.layout)
  }
  hub(query: string, signal: AbortSignal = this.abort.signal, onRefresh?: (rows: HubRepository[]) => void) {
    return this.catalog.list(query, AbortSignal.any([signal, this.abort.signal]), onRefresh)
  }
  files(repository: string, signal?: AbortSignal) {
    return modelFiles(repository, this.deps.request, signal)
  }
  async localKey() {
    return (await this.keys.get()) || this.deps.apiKey
  }
  async initializeKeys() {
    await this.keys.initialize(this.deps.apiKey)
  }
  async loadModel(provider: string, model: string) {
    const link = await this.deps.base.attach({ launch: true, log: this.log })
    await link.models.load(provider, model)
    await this.api(true, false)
  }
  async localEndpoint(): Promise<string> {
    const api = (await this.config()).values.api
    let port = api.port
    if (port === 0) {
      const link = await this.deps.base.attach({ launch: false, log: this.log })
      port = (await link.server.status()).port
    }
    const host = ['0.0.0.0', '::'].includes(api.host) ? '127.0.0.1' : api.host
    return `http://${host.includes(':') ? '[' + host + ']' : host}:${port}${api.prefix}`
  }
  private async keyFor(endpoint: string) {
    const api = (await this.config()).values.api
    const url = new URL(endpoint)
    const localHosts = ['127.0.0.1', 'localhost', '[::1]']
    const hostMatches =
      url.hostname === api.host ||
      (localHosts.includes(url.hostname) && ['0.0.0.0', '::', ...localHosts].includes(api.host))
    let port = api.port
    if (hostMatches && port === 0) {
      try {
        const link = await this.deps.base.attach({ launch: false, log: this.log })
        port = (await link.server.status()).port
      } catch {
        /* No local listener. */
      }
    }
    if (
      hostMatches &&
      Number(url.port || 80) === port &&
      url.pathname.replace(/\/$/, '') === api.prefix.replace(/\/$/, '')
    )
      return this.localKey()
    return this.deps.chatKey
  }
  async chat(
    endpoint: string,
    model: string,
    messages: ChatMessage[],
    onText: (text: string) => void
  ): Promise<void> {
    this.turn?.abort()
    const turn = new AbortController()
    this.turn = turn
    try {
      await streamChat({
        endpoint,
        model,
        messages,
        key: await this.keyFor(endpoint),
        request: this.deps.request,
        signal: AbortSignal.any([turn.signal, this.abort.signal, AbortSignal.timeout(600000)]),
        onText,
      })
    } finally {
      if (this.turn === turn) this.turn = undefined
    }
  }
  async api(start: boolean, restoreModel = true): Promise<void> {
    if (start) await this.keys.initialize(this.deps.apiKey)
    const link = await this.deps.base.attach({ launch: start, log: this.log })
    if (start) {
      if (!(await link.server.status()).running) {
        const config = (await this.config()).values
        if (restoreModel && config.tui.model) {
          const selected = (await this.installed()).find((m) => m.id === config.tui.model)
          if (selected && !(await link.models.sessions()).some((s) => s.model_id === selected.id)) {
            const manifest = await this.setup.read()
            const provider = modelProvider(
              (await this.engineSelection.read()) || manifest?.engine.provider || '',
              selected.provider
            )
            await link.models.load(provider, selected.id)
          }
        }
        await startApi(link, config, await this.localKey())
      }
    } else await link.server.stop()
    await this.legacy.run({ name: 'refresh' })
  }
  /** A daemon replacement gets a fresh subscription; the console holds no ownership lease. */
  async observe(instance: string): Promise<void> {
    if (this.instance === instance) return
    this.instance = instance
    this.observer?.abort()
    if (!instance) return
    const observer = new AbortController()
    this.observer = observer
    try {
      const link: CoreLink = await this.deps.base.attach({ launch: false, log: this.log })
      if (observer.signal.aborted) return
      await link.events.subscribe(
        (message) => {
          const payload = (message.data as { payload?: unknown })?.payload ?? message.data
          this.setup.event(message.event, payload)
          if (message.event !== 'api:request') return
          const data = message.data as { payload?: unknown }
          const row = requestRow(data?.payload ?? data)
          if (row) this.onRequest(row)
        },
        { signal: observer.signal }
      )
    } catch (e) {
      if (!observer.signal.aborted) {
        this.instance = ''
        this.onError(oneLine(e))
      }
    }
  }
}
