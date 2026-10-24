import { EngineDownloads } from './engine-downloads.js'
import { embedWorkspaceDocuments } from './workspace-embeddings.js'
import { requireReadiness } from './require-readiness.js'
import { WorkspaceFeatureService } from './features.js'
import { enginePreferenceOperation } from './engine-preference.js'
import { workspaceLogs } from './workspace-logs.js'
import { join } from 'node:path'
import { AtcError } from '../errors/index.js'
import { AGENTS, agentProfile, type AgentId } from '../agent-launch/index.js'
import { ChatHistory, ClientKeys, type Conversation } from '../terminal-data/index.js'
import { WORKSPACE_OPERATIONS, type WorkspaceInput } from '../contract/index.js'
import { inputFor, object, sanitized } from './validation.js'
import { WorkspaceMetrics } from './metrics.js'
import { LoadStages } from './load-stages.js'
import { publicEndpoint, workspaceSnapshot } from './snapshot.js'
import { saveWorkspaceSetup } from './state.js'
import { coreOperation, NOT_CORE } from './core-operations.js'
import { cloudOperation } from './cloud-connections.js'
import { modelOperation } from './model-operations.js'
import { WorkspaceCatalog } from './catalog.js'
import { engineSettingsSchema, workspaceConfig, updateWorkspaceConfig } from './settings.js'
import { verifyWorkload } from './readiness.js'
import { callPublic } from './public-api.js'
import { completeChat } from './chat-complete.js'
import { downloadProxy } from './download-proxy.js'
import { FoundryAccelerators } from './foundry.js'
import { foundryOperation } from './foundry-operations.js'
import { DownloadMutations } from './download-mutations.js'
import { removeDownload } from './download-removal.js'
import { modelDownloads } from './model-downloads.js'
import { ChatJobs } from './chat-jobs.js'
import { importConversations } from './history-transfer.js'
import type { WorkspaceServiceOptions } from './service-options.js'
export type { WorkspaceServiceOptions } from './service-options.js'
export class WorkspaceService {
  readonly metrics = new WorkspaceMetrics()
  private readonly loads = new LoadStages()
  private keys: ClientKeys
  private history: ChatHistory
  private request: typeof fetch
  private catalog: WorkspaceCatalog
  private foundry: FoundryAccelerators
  private readonly mutations = new DownloadMutations()
  private downloads: ReturnType<typeof modelDownloads>
  private features: WorkspaceFeatureService
  private chats: ChatJobs
  private engineDownloads: EngineDownloads
  constructor(private options: WorkspaceServiceOptions) {
    this.features = new WorkspaceFeatureService(
      options.paths.atcDir,
      options.fetch ?? fetch,
      options.env ?? {},
      (input, model) => embedWorkspaceDocuments(options, this.keys, input, model)
    )
    this.keys = new ClientKeys(options.paths.atcDir)
    this.history = new ChatHistory(options.paths.atcDir)
    this.chats = new ChatJobs(options, this.keys, this.history)
    this.request = options.fetch ?? fetch
    this.catalog = new WorkspaceCatalog(options.paths, this.request)
    this.engineDownloads = new EngineDownloads(
      options.paths.atcDir,
      options.link,
      downloadProxy(options.config)
    )
    this.downloads = modelDownloads(options, this.catalog, this.request, this.engineDownloads)
    this.foundry = new FoundryAccelerators(options.link)
  }
  /** Once per server, before any work: bring files of an earlier atc to where the core expects them. */
  start(): Promise<{ kept: string[] }> {
    return this.downloads.artifacts.migrate()
  }
  event(name: string, payload: unknown): void {
    this.metrics.event(name, payload)
    this.loads.event(name, payload)
    this.foundry.event(name, payload)
    this.engineDownloads.event(name, payload)
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
    result.downloads.push(
      ...(await this.engineDownloads.list(result.downloads)),
      ...this.downloads.downloader.snapshot()
    )
    result.loads = this.loads.list()
    result.setups.push(
      ...(await this.downloads.setups.list()),
      ...(await this.downloads.artifacts.list()),
      ...(await this.downloads.managed.list()),
      ...(await this.downloads.foundry.list())
    )
    result.features = await this.features.view()
    return result
  }
  execute(operation: string, raw: WorkspaceInput = {}): Promise<unknown> {
    return this.mutations.run(operation, () => this.dispatch(operation, raw))
  }
  private async dispatch(operation: string, raw: WorkspaceInput): Promise<unknown> {
    const descriptor = WORKSPACE_OPERATIONS.find((op) => op.name === operation)
    if (!descriptor) throw new AtcError('ATC_USAGE', `Unknown operation: ${operation}. Use operations.list.`)
    const input = inputFor(descriptor, raw),
      { link, paths, config } = this.options
    await requireReadiness(operation, input, () => this.snapshot())
    const preference = await enginePreferenceOperation(link, paths.atcDir, operation, input)
    if (preference !== NOT_CORE) return preference
    const feature = await this.features.execute(operation, input)
    if (feature !== NOT_CORE) return feature
    const cloud = await cloudOperation(link, paths, this.request, operation, input)
    if (cloud !== NOT_CORE) return sanitized(cloud)
    const model = await modelOperation(
      {
        options: this.options,
        catalog: this.catalog,
        request: this.request,
        managed: this.downloads.managed,
      },
      operation,
      input
    )
    if (model !== NOT_CORE) return model
    const foundry = foundryOperation(this.foundry, this.downloads.foundry, operation, input)
    if (foundry !== NOT_CORE) return foundry
    switch (operation) {
      case 'engines.enqueue':
        return this.engineDownloads.enqueue(String(input['engine']), input)
      case 'engines.retry':
        return this.engineDownloads.retry(String(input['id']))
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
      case 'logs.read':
        return workspaceLogs(paths.daemonLog, Number(input['lines'] ?? 150))
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
        return this.downloads.setups.operation(operation, input)
      case 'downloads.remove':
        return removeDownload(this.downloads, this.options, input, () => this.snapshot())
      case 'artifacts.plan':
        return this.downloads.artifacts.plan(input)
      case 'artifacts.install':
        return this.downloads.artifacts.install(input)
      case 'artifacts.list':
        return this.downloads.artifacts.list()
      case 'artifacts.resume':
        return this.downloads.artifacts.resume(String(input['id']))
      case 'artifacts.cancel':
        return this.downloads.artifacts.cancel(String(input['id']))
      case 'artifacts.load':
        return this.downloads.artifacts.load(String(input['id']))
    }
    if (operation === 'media.configure')
      input['request'] = { ...object(input['request']), dataFolder: paths.dataFolder }
    const result = await coreOperation(
      link,
      operation,
      input,
      downloadProxy(this.options.config),
      (engine, taskId) => this.engineDownloads.ensure(engine, taskId)
    ).catch((error: unknown) => {
      if (operation === 'models.load') this.loads.drop(String(input['provider']), String(input['model_id']))
      throw error
    })
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
