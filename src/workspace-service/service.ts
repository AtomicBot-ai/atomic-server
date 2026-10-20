import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AtcConfig, AtcPaths } from '../config/index.js'
import type { CoreLink } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'
import { AGENTS, agentProfile, type AgentId } from '../agent-launch/index.js'
import type { Conversation } from '../terminal-data/index.js'
import { ChatHistory, ClientKeys } from '../terminal-data/index.js'
import { WORKSPACE_OPERATIONS } from '../contract/index.js'
import type { WorkspaceInput } from '../contract/index.js'
import { inputFor, object, sanitized } from './validation.js'
import { WorkspaceMetrics } from './metrics.js'
import { publicEndpoint, workspaceSnapshot } from './snapshot.js'
import { saveWorkspaceSetup } from './state.js'
import { coreOperation, NOT_CORE } from './core-operations.js'
import { modelOperation } from './model-operations.js'
import { WorkspaceCatalog } from './catalog.js'
import { engineSettingsSchema, workspaceConfig, updateWorkspaceConfig } from './settings.js'
import { verifyWorkload } from './readiness.js'
import { callPublic } from './public-api.js'
import { completeChat } from './chat-complete.js'
import type { ArtifactService } from './artifacts.js'
import type { ModelSetups } from './model-setups.js'
import type { ManagedModelSetups } from './managed-model-setups.js'
import { FoundryAccelerators } from './foundry.js'
import type { Downloader } from '../downloads/index.js'
import { modelDownloads } from './model-downloads.js'
import { ChatJobs } from './chat-jobs.js'
import { importConversations } from './history-transfer.js'
export interface WorkspaceServiceOptions {
  link: CoreLink
  paths: AtcPaths
  config: AtcConfig
  fetch?: typeof fetch
  platform?: NodeJS.Platform
  selfCommand?: readonly string[]
  /** The server's environment: `HF_TOKEN` for gated model downloads. */
  env?: NodeJS.ProcessEnv
}
export class WorkspaceService {
  readonly metrics = new WorkspaceMetrics()
  private keys: ClientKeys
  private history: ChatHistory
  private request: typeof fetch
  private catalog: WorkspaceCatalog
  private artifacts: ArtifactService
  private setups: ModelSetups
  private managed: ManagedModelSetups
  private foundry: FoundryAccelerators
  /** Every model download of this server: GGUF setups, media and MLX. */
  private downloader: Downloader
  private chats: ChatJobs
  constructor(private options: WorkspaceServiceOptions) {
    this.keys = new ClientKeys(options.paths.atcDir)
    this.history = new ChatHistory(options.paths.atcDir)
    this.chats = new ChatJobs(options, this.keys, this.history)
    this.request = options.fetch ?? fetch
    this.catalog = new WorkspaceCatalog(options.paths, this.request)
    const downloads = modelDownloads(options, this.catalog, this.request)
    this.downloader = downloads.downloader
    this.artifacts = downloads.artifacts
    this.setups = downloads.setups
    this.managed = downloads.managed
    this.foundry = new FoundryAccelerators(options.link)
  }
  /** Once per server, before any work: bring files of an earlier atc to where the core expects them. */
  start(): Promise<{ kept: string[] }> {
    return this.artifacts.migrate()
  }
  event(name: string, payload: unknown): void {
    this.metrics.event(name, payload)
  }
  async snapshot() {
    const result = await workspaceSnapshot(
      this.options.link,
      this.options.paths,
      this.options.config,
      this.keys,
      this.metrics
    )
    // The core's own downloads are engine builds; every model transfer is this server's.
    result.downloads.push(...this.downloader.snapshot())
    result.setups.push(
      ...(await this.setups.list()),
      ...(await this.artifacts.list()),
      ...(await this.managed.list())
    )
    return result
  }
  async execute(operation: string, raw: WorkspaceInput = {}): Promise<unknown> {
    const descriptor = WORKSPACE_OPERATIONS.find((op) => op.name === operation)
    if (!descriptor) throw new AtcError('ATC_USAGE', `Unknown operation: ${operation}. Use operations.list.`)
    const input = inputFor(descriptor, raw),
      { link, paths, config } = this.options
    const model = await modelOperation(
      { options: this.options, catalog: this.catalog, request: this.request, managed: this.managed },
      operation,
      input
    )
    if (model !== NOT_CORE) return model
    switch (operation) {
      case 'foundry.accelerators':
        return this.foundry.status(input['force'] === true)
      case 'foundry.prepare':
        return this.foundry.prepare(
          Array.isArray(input['accelerators']) ? input['accelerators'].map(String) : undefined
        )
      case 'settings.schema':
        return engineSettingsSchema(String(input['provider']))
      case 'config.get':
        return {
          ...workspaceConfig(config),
          command_prefix: `${(this.options.selfCommand ?? ['atc']).map(shellWord).join(' ')} --data-folder ${shellWord(paths.dataFolder)}`,
        }
      case 'config.update':
        return updateWorkspaceConfig(paths, config, object(input['values']))
      case 'operations.list':
        return WORKSPACE_OPERATIONS
      case 'api.start':
      case 'api.restart': {
        const body = {
          host: config.api.host,
          port: config.api.port,
          prefix: config.api.prefix,
          trusted_hosts: config.api.trustedHosts,
          ...object(input['request']),
          api_key: await this.keys.get(),
          fallback_port: false,
        }
        if (operation === 'api.restart') await link.server.stop()
        return sanitized(await link.server.start(body))
      }
      case 'api.inspector': {
        const result = await link.request('PUT', '/server/inspector', { enabled: input['enabled'] })
        this.metrics.setDetailed(input['enabled'] === true)
        return result
      }
      case 'api.stop':
        return sanitized(await link.server.stop())
      case 'api.ping': {
        const ping = await callPublic(link, config, this.keys, this.request, '/models')
        return { ok: true, latency_ms: ping.latency_ms, models: ping.result }
      }
      case 'connection.info':
        return {
          ...publicEndpoint(object(await link.server.status()), config),
          keys: await this.keys.list(),
          agents: AGENTS,
        }
      case 'connection.agents':
        return AGENTS
      case 'connection.profile': {
        const agent = String(input['agent']) as AgentId,
          model = String(input['model']),
          state = await link.server.status(),
          base = publicEndpoint(object(state), config).endpoint,
          key = await this.keys.get(input['key_id'] as string | undefined)
        if (!state.running) throw new AtcError('ATC_USAGE', 'Start the API before connecting an agent.')
        if (!key) throw new AtcError('ATC_USAGE', 'Select an existing API key.')
        if (!(await link.models.sessions()).some((s) => s.model_id === model))
          throw new AtcError('ATC_USAGE', 'Load the selected chat model before connecting an agent.')
        return {
          agent,
          endpoint: base,
          model,
          profile: agentProfile(agent, base, model, key, join(paths.atcDir, 'agents', agent)),
          launch_command: `${(this.options.selfCommand ?? ['atc']).map(shellWord).join(' ')} --data-folder ${shellWord(paths.dataFolder)} connect ${agent} --model ${shellWord(model)}${input['key_id'] ? ` --key-id ${shellWord(String(input['key_id']))}` : ''}`,
        }
      }
      case 'keys.list':
        return this.keys.list()
      case 'keys.create':
        return this.keys.create(String(input['name']))
      case 'keys.reveal': {
        const key = await this.keys.get(input['id'] as string | undefined)
        if (!key) throw new AtcError('ATC_USAGE', 'No such API key.')
        return { key }
      }
      case 'keys.revoke':
        if (!(await this.keys.list()).some((k) => k.id === input['id']))
          throw new AtcError('ATC_USAGE', 'No such API key.')
        await this.keys.revoke(String(input['id']))
        return { revoked: true }
      case 'setup.manual':
        return saveWorkspaceSetup(paths, 'manual')
      case 'setup.complete': {
        const snapshot = await this.snapshot()
        if (
          !snapshot.api.running ||
          !snapshot.services.some((s) => ['ready', 'running', 'loaded'].includes(s.state))
        )
          throw new AtcError(
            'ATC_USAGE',
            'Start the API and load a model before finishing guided setup. Set up manually skips this check.'
          )
        const selected = snapshot.services.filter(
          (s) =>
            (!input['model_id'] || s.model === input['model_id']) &&
            (!input['service_id'] || s.id === input['service_id'])
        )
        await verifyWorkload(link, config, this.keys, this.request, selected)
        return saveWorkspaceSetup(paths, 'guided')
      }
      case 'logs.read': {
        const text = await readFile(paths.daemonLog, 'utf8').catch((e: NodeJS.ErrnoException) => {
          if (e.code === 'ENOENT') return ''
          throw e
        })
        return {
          lines: text
            .split('\n')
            .slice(-Number(input['lines'] ?? 150))
            .map((line) =>
              line.replace(/atc_[a-f0-9]{64}/g, '[API key]').replace(/(Bearer\s+)\S+/gi, '$1[redacted]')
            ),
        }
      }
      case 'history.list':
        return this.history.list()
      case 'history.load':
        return this.history.load(String(input['id']))
      case 'history.remove':
        await this.history.remove(String(input['id']))
        return { removed: true }
      case 'history.save': {
        const chat = object(input['chat'])
        if (!Array.isArray(chat['messages']) || typeof chat['id'] !== 'string')
          throw new AtcError('ATC_USAGE', 'A chat needs id and messages.')
        await this.history.save(chat as unknown as Conversation)
        return { saved: true }
      }
      case 'chat.start':
        return this.chats.start(input)
      case 'chat.progress':
        return this.chats.get(String(input['id']))
      case 'chat.cancel':
        return this.chats.cancel(String(input['id']))
      case 'history.import':
        return importConversations(this.history, input['conversations'])
      case 'chat.complete':
        return completeChat(this.options, this.keys, this.history, this.request, input)
      case 'models.plan':
      case 'models.install':
      case 'setup.status':
      case 'setup.resume':
      case 'setup.cancel':
        return this.setups.operation(operation, input)
      case 'artifacts.plan':
        return this.artifacts.plan(input)
      case 'artifacts.install':
        return this.artifacts.install(input)
      case 'artifacts.list':
        return this.artifacts.list()
      case 'artifacts.resume':
        return this.artifacts.resume(String(input['id']))
      case 'artifacts.cancel':
        return this.artifacts.cancel(String(input['id']))
      case 'artifacts.load':
        return this.artifacts.load(String(input['id']))
    }
    if (operation === 'media.configure')
      input['request'] = { ...object(input['request']), dataFolder: paths.dataFolder }
    const result = await coreOperation(link, operation, input)
    if (result === NOT_CORE) throw new AtcError('ATC_USAGE', `No implementation for ${operation}.`)
    // Inference results are content, not session credentials. Keep token statistics and user JSON intact.
    return operation.endsWith('.run') || operation.includes('.job') || operation.endsWith('.create')
      ? result
      : sanitized(result)
  }
}
function shellWord(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`
}
