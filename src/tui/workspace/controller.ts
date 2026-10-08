import { prepareAgent } from '../../agent-launch/index.js'
import type { AgentHost, AgentId } from '../../agent-launch/index.js'
import type { TuiAction } from '../state.js'
import type { TuiDeps } from '../controller.js'
import { TuiController, oneLine } from '../controller.js'
import type { TuiCommand } from '../keys.js'
import { createLogger } from '../../output/index.js'
import { setConfigValue } from '../../config/index.js'
import type { CoreLink } from '../../core-link/index.js'
import { listChatModels, streamChat, startApi, requestRow } from '../../terminal-service/index.js'
import type { ChatMessage, RequestRow } from '../../terminal-service/index.js'
export interface WorkspaceDeps {
  agentHost?: AgentHost
  base: TuiDeps
  request: typeof fetch
  apiKey: string
  chatKey: string
}
export class WorkspaceController {
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
  }
  start(): void {
    this.legacy.start()
  }
  dispose(): void {
    this.abort.abort()
    this.observer?.abort()
    this.turn?.abort()
    this.legacy.dispose()
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
  prepareAgent(id: AgentId, endpoint: string, model: string) {
    if (!this.deps.agentHost) throw new Error('Agent handoff is unavailable in this terminal.')
    return prepareAgent(id, endpoint, model, this.deps.apiKey, this.deps.agentHost)
  }
  models(endpoint: string, server = false): Promise<string[]> {
    return listChatModels(
      endpoint,
      this.deps.request,
      server ? this.deps.apiKey : this.deps.chatKey,
      AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)])
    )
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
        key: this.deps.chatKey,
        request: this.deps.request,
        signal: AbortSignal.any([turn.signal, this.abort.signal, AbortSignal.timeout(600000)]),
        onText,
      })
    } finally {
      if (this.turn === turn) this.turn = undefined
    }
  }
  async api(start: boolean): Promise<void> {
    const link = await this.deps.base.attach({ launch: start, log: this.log })
    if (start) await startApi(link, (await this.config()).values, this.deps.apiKey)
    else await link.server.stop()
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
