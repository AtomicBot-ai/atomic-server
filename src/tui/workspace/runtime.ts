import type { WorkspaceClient } from '../../workspace-service/index.js'
import { createWorkspaceClient, readWorkspaceSetup } from '../../workspace-service/index.js'
import type { AtcConfig } from '../../config/index.js'
import { atcPathsFor } from '../../config/index.js'
import { createLogger } from '../../output/index.js'
import { readDaemonRecord } from '../../core-link/index.js'
import type { TuiDeps } from '../controller.js'
/** Owns the shared service across polling ticks; metrics survive ordinary refreshes. */
export class WorkspaceRuntime {
  private service: WorkspaceClient | undefined
  private instance = ''
  private config: AtcConfig | undefined
  private readonly paths
  private readonly log = createLogger(() => undefined, { level: 'error' })
  constructor(
    private deps: TuiDeps,
    private request: typeof fetch
  ) {
    this.paths = atcPathsFor(deps.paths.layout.root)
  }
  setup() {
    return readWorkspaceSetup(this.paths)
  }
  async connect(launch: boolean) {
    const link = await this.deps.attach({ launch, log: this.log })
    const snap = await link.snapshot()
    const config = (await this.deps.loadConfig()).values
    if (this.config) Object.assign(this.config, config)
    if (!this.service || this.instance !== snap.instance_id) {
      this.config = config
      this.instance = snap.instance_id
      this.service = await createWorkspaceClient({
        link,
        paths: this.paths,
        config: this.config,
        fetch: this.request,
      })
    }
    return this.service
  }
  async snapshot() {
    return (await this.connect(false)).snapshot()
  }
  async execute(name: string, input: Record<string, unknown> = {}) {
    return (await this.connect(true)).execute(name, input)
  }
  async openAdmin() {
    const record = await readDaemonRecord(this.deps.paths.daemonRecord)
    if (!record?.admin_url) throw new Error('Start the server with web admin enabled.')
    await this.deps.openUrl(await this.deps.loginUrl(record.admin_url))
  }
  agentBrief() {
    const folder = "'" + this.paths.dataFolder.replaceAll("'", "'\\''") + "'"
    const command = `atc --data-folder ${folder}`
    return `Set up this Atomic Chat server using its typed controls. Preserve existing keys and data.\n\nDiscover: ${command} control list --json\nCall: ${command} control call <operation> --input @input.json --json\nWatch: ${command} control watch\n\nMCP configuration:\n${JSON.stringify({ mcpServers: { 'atomic-chat': { command: 'atc', args: ['--data-folder', this.paths.dataFolder, 'mcp'] } } }, null, 2)}\n\nInspect hardware.info and models.catalog. Ask me to choose a model, review models.plan or artifacts.plan and disk size, then install that reviewed plan. Poll the installation, load it, start api.start, and verify api.ping plus a small inference. Use setup.complete only after it works. Keep the listener on localhost unless I request network access.`
  }
  dispose() {
    this.service = undefined
  }
}
