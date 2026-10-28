import { EngineDownloads } from './engines/engine-downloads.js'
import { embedWorkspaceDocuments } from './features/workspace-embeddings.js'
import { requireReadiness } from './snapshot/require-readiness.js'
import { WorkspaceFeatureService } from './features/features.js'
import { enginePreferenceOperation } from './engines/engine-preference.js'
import { AtcError } from '../errors/index.js'
import { ChatHistory, ClientKeys } from '../terminal-data/index.js'
import { WORKSPACE_OPERATIONS, type WorkspaceInput } from '../contract/index.js'
import { inputFor, object, sanitized } from './validation.js'
import { WorkspaceMetrics } from './snapshot/metrics.js'
import { LoadStages } from './snapshot/load-stages.js'
import { workspaceSnapshot } from './snapshot/snapshot.js'
import { SnapshotCache } from './snapshot/snapshot-cache.js'
import { coreOperation, NOT_CORE } from './core-operations.js'
import { withRemoteSetup } from './remote-setup.js'
import { cloudOperation } from './cloud/cloud-connections.js'
import { modelOperation } from './models/model-operations.js'
import { WorkspaceCatalog } from './models/catalog.js'
import { downloadProxy } from './models/download-proxy.js'
import { FoundryAccelerators } from './foundry/foundry.js'
import { foundryOperation } from './foundry/foundry-operations.js'
import { DownloadMutations } from './download-mutations.js'
import { downloadOperation } from './models/download-operations.js'
import { litertOperation } from './litert/litert-operations.js'
import { modelDownloads } from './models/model-downloads.js'
import { ChatJobs } from './chat/chat-jobs.js'
import { serverOperation } from './server-operations.js'
import { chatOperation } from './chat/chat-operations.js'
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
  private readonly shared = new SnapshotCache(() => this.readCore(), { now: Date.now, maxAgeMs: 1000 })
  constructor(private options: WorkspaceServiceOptions) {
    this.features = new WorkspaceFeatureService(
      options.paths.atcDir,
      options.fetch ?? fetch,
      options.env ?? {},
      (input, model) => embedWorkspaceDocuments(options, this.keys, input, model)
    )
    this.keys = new ClientKeys(options.paths.atcDir)
    this.history = new ChatHistory(options.paths.atcDir)
    this.chats = new ChatJobs(options, this.keys, this.history, (body) => this.features.enrich(body))
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
    this.downloads.litert.accelerators.event(name, payload)
    this.engineDownloads.event(name, payload)
    // A log line changes nothing a snapshot shows; every other event may.
    if (name !== 'core:log') this.shared.invalidate()
  }
  /**
   * The workspace as clients poll it. What costs core requests (`workspaceSnapshot`) is shared between
   * them for up to a second (`SnapshotCache`); what this server keeps itself — engine jobs, its own
   * transfers, load stages, setup records, features — is read for every answer, as before.
   * `fresh` reads the core now: what decides an operation never rests on a shared copy.
   */
  async snapshot(options: { fresh?: boolean } = {}) {
    if (options.fresh) this.shared.invalidate()
    const result = await this.shared.get()
    result.downloads.push(...(await this.engineDownloads.list()), ...this.downloads.downloader.snapshot())
    result.loads = this.loads.list()
    result.setups.push(
      ...(await this.downloads.setups.list()),
      ...(await this.downloads.artifacts.list()),
      ...(await this.downloads.managed.list()),
      ...(await this.downloads.foundry.list()),
      ...(await this.downloads.litert.models.list())
    )
    result.features = await this.features.view()
    if (this.options.atc) result.atc = this.options.atc()
    return result
  }
  private async readCore() {
    const result = await workspaceSnapshot(
      this.options.link,
      this.options.paths,
      this.options.config,
      this.keys,
      this.metrics
    )
    // The core's own downloads are engine builds; every model transfer is this server's. Synced here,
    // on rows just read, so a shared copy never replays an older progress over a newer stage.
    this.engineDownloads.sync(result.downloads)
    return result
  }
  async execute(operation: string, raw: WorkspaceInput = {}): Promise<unknown> {
    try {
      return await this.mutations.run(operation, () => this.dispatch(operation, raw))
    } finally {
      // Even a failed change may have changed something; reads leave the shared snapshot alone.
      if (WORKSPACE_OPERATIONS.find((op) => op.name === operation)?.mutates !== false)
        this.shared.invalidate()
    }
  }
  private async dispatch(operation: string, raw: WorkspaceInput): Promise<unknown> {
    const descriptor = WORKSPACE_OPERATIONS.find((op) => op.name === operation)
    if (!descriptor) throw new AtcError('ATC_USAGE', `Unknown operation: ${operation}. Use operations.list.`)
    const input = inputFor(descriptor, raw),
      { link, paths } = this.options
    await requireReadiness(operation, input, () => this.snapshot({ fresh: true }))
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
    const litert = litertOperation(this.downloads.litert, operation, input)
    if (litert !== NOT_CORE) return litert
    const download = downloadOperation(
      {
        downloads: this.downloads,
        engines: this.engineDownloads,
        options: this.options,
        snapshot: () => this.snapshot({ fresh: true }),
      },
      operation,
      input
    )
    if (download !== NOT_CORE) return download
    const server = await serverOperation(
      {
        options: this.options,
        keys: this.keys,
        metrics: this.metrics,
        request: this.request,
        snapshot: () => this.snapshot({ fresh: true }),
      },
      operation,
      input
    )
    if (server !== NOT_CORE) return server
    const chat = await chatOperation(
      {
        options: this.options,
        keys: this.keys,
        history: this.history,
        chats: this.chats,
        request: this.request,
        enrich: (body) => this.features.enrich(body),
      },
      operation,
      input
    )
    if (chat !== NOT_CORE) return chat
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
      : withRemoteSetup(operation, sanitized(result), this.options.remoteSetup)
  }
}
