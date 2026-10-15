/**
 * The long-lived `atc` process: the core in-process (owner of the data folder), the admin server,
 * the hardware facts the core cannot measure itself, the host-step loop for managed runtimes, and
 * the run record that tells commands this owner is an `atc` daemon. Everything else is a command
 * that attaches to it.
 */

import { mkdir } from 'node:fs/promises'
import { WorkspaceService, sanitizeWorkspaceData } from '../workspace-service/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { telemetryConsent } from '../telemetry/index.js'
import { AtomicCore } from '@atomic-chat/core'
import { CoreClient } from '@atomic-chat/core/client'
import { ADMIN_BUILD_ID, AdminServer, ensureAdminToken, RelayHub, SessionStore } from '../admin/index.js'
import type { AdminConfigView, AdminStatus } from '../contract/index.js'
import type { AtcPaths, ResolvedConfig } from '../config/index.js'
import { FIELDS, getAt } from '../config/index.js'
import { HttpCoreLink, InProcessEvents, removeDaemonRecord, writeDaemonRecord } from '../core-link/index.js'
import type { CoreLink, DaemonRecord } from '../core-link/index.js'
import {
  HostStepExecutor,
  HostStepJournal,
  probeHardware,
  restrictToOwner,
  toOverride,
} from '../host/index.js'
import type { EnvironmentOperationView, HostServices } from '../host/index.js'
import type { AtcIo } from '../io.js'
import type { Logger } from '../output/index.js'
import { ATC_BUILD_DATE, ATC_GIT_SHA, ATC_VERSION, CORE_VERSION } from '../version.js'

export interface DaemonOptions {
  paths: AtcPaths
  io: AtcIo
  config: ResolvedConfig
  host: HostServices
  log: Logger
  controlPort: number
  controlHost?: string
  admin: { enabled: boolean; host?: string; port?: number }
  telemetry?: boolean
  now?: () => number
  /** Test seam: skip the hardware probe (it spawns `nvidia-smi`). */
  probeHardware?: boolean
  /** Test seam: how the core is created (the tests record the options it is given). */
  createCore?: typeof AtomicCore.create
}

export interface RunningDaemon {
  core: AtomicCore
  link: CoreLink
  admin: AdminServer | undefined
  relay: RelayHub
  record: DaemonRecord
  hostSteps: HostStepExecutor
  stopped: Promise<void>
  shutdown(): Promise<void>
}

const PENDING_POLL_MS = 2_000

export async function startDaemon(options: DaemonOptions): Promise<RunningDaemon> {
  const { paths, io, log, host } = options
  const now = options.now ?? Date.now
  const startedAt = now()
  const coreLog = log.child('core')
  await mkdir(paths.atcDir, { recursive: true })
  const denied = await restrictToOwner(paths.atcDir, {
    platform: host.facts.platform,
    user: io.env['USERDOMAIN'] ? `${io.env['USERDOMAIN']}\\${host.facts.username}` : host.facts.username,
    exec: host.exec,
    systemRoot: io.env['SystemRoot'] ?? io.env['SYSTEMROOT'],
  })
  if (denied) log.warn(`could not restrict ${paths.atcDir} to this user: ${denied}`)
  else if (host.facts.platform === 'win32') log.info(`restricted ${paths.atcDir} to this user`)
  const keys = new ClientKeys(paths.atcDir)
  // Before the core: with no keyring the public server would check no key at all.
  await keys.initialize(io.env['ATC_API_KEY'] ?? '')
  const consent = telemetryConsent(options.telemetry, options.config)
  const core = await (options.createCore ?? AtomicCore.create.bind(AtomicCore))({
    // The keyring, read on every public request: one of its keys is required, a revoked one is refused
    // at once (`[]` refuses everyone). The core's own `server.api_key` does not apply.
    publicApiKeys: () => keys.current(),
    // A model check gives up reading a remote GGUF header after 20 s instead of hanging on a slow mirror.
    remoteGgufTimeoutMs: 20_000,
    ownerScope: 'cli',
    dataFolder: paths.dataFolder,
    controlPort: options.controlPort,
    ...(options.controlHost ? { controlHost: options.controlHost } : {}),
    env: io.env,
    logger: (level, message) => coreLog[level](message),
    telemetry: {
      host: 'atc',
      hostVersion: ATC_VERSION,
      // Only an explicit choice: the default would override DO_NOT_TRACK and the core's stored consent.
      ...(consent !== undefined ? { enabled: consent } : {}),
    },
  })
  // Published before anything slow: a command attaching now must see an atc daemon, not a foreign owner.
  const startingRecord: DaemonRecord = {
    schema_version: 1,
    pid: process.pid,
    instance_id: core.instanceId,
    state: 'starting',
    atc_version: ATC_VERSION,
    core_version: CORE_VERSION,
    control_url: `http://${core.control.host}:${core.control.port}`,
    admin_url: null,
    started_at: startedAt,
  }
  await writeDaemonRecord(paths.daemonRecord, startingRecord)
  const relay = new RelayHub()
  const controlUrl = `http://${core.control.host}:${core.control.port}`
  const client = new CoreClient({ baseUrl: controlUrl, token: core.controlToken, name: 'atc-daemon' })
  const link = new HttpCoreLink({
    endpoint: { baseUrl: controlUrl, instanceId: core.instanceId, version: CORE_VERSION, pid: process.pid },
    client,
    events: new InProcessEvents(core, () => client.snapshot()),
    pid: process.pid,
    log: (m) => log.debug(m),
  })

  const workspace = new WorkspaceService({
    link,
    paths,
    config: options.config.values,
    fetch: io.fetch,
    platform: host.facts.platform,
    selfCommand: host.selfCommand,
    // Models are downloaded here, not by the core: `HF_TOKEN` reaches gated repositories.
    env: io.env,
  })
  const hostSteps = new HostStepExecutor({
    hostStepsDir: paths.hostStepsDir,
    journal: new HostStepJournal(paths.hostStepsJournal),
    dataFolder: paths.dataFolder,
    instanceId: core.instanceId,
    context: { ...host.facts, inDaemon: true },
    elevator: host.elevator,
    post: (operationId, receipt) =>
      link.environments.hostStepResult(operationId, receipt).then(() => undefined),
    log: log.child('host-step'),
    newId: () => crypto.randomUUID(),
  })
  const offEvents = core.events.onAny((record) => {
    relay.publish(record.name, sanitizeWorkspaceData(record.payload))
    workspace.event(String(record.name), record.payload)
    if (String(record.name) === 'environment:operation') {
      void hostSteps
        .handle(record.payload as unknown as EnvironmentOperationView)
        .catch((e: unknown) => log.warn(`host step failed: ${String(e)}`))
    }
  })
  const pendingTimer = setInterval(() => {
    void hostSteps.checkPendingResults().catch((e: unknown) => log.debug(`pending host steps: ${String(e)}`))
  }, PENDING_POLL_MS)
  pendingTimer.unref?.()

  if (options.probeHardware !== false) {
    try {
      const probe = await probeHardware({
        exec: host.exec,
        platform: host.facts.platform,
        arch: host.facts.arch,
        readFile: io.readFile,
      })
      for (const note of probe.notes) log.debug(`hardware: ${note}`)
      await link.hardware.set(toOverride(probe))
      log.info(`hardware: ${probe.gpus.length} GPU(s), cpu ${probe.cpu_extensions.join(',') || 'none'}`)
    } catch (error) {
      log.warn(`hardware probe failed; the core will pick a CPU engine: ${String(error)}`)
    }
  }

  let admin: AdminServer | undefined
  const status = async (): Promise<AdminStatus> => {
    const snapshot = await link.snapshot()
    return {
      atc: {
        version: ATC_VERSION,
        git_sha: ATC_GIT_SHA ?? null,
        build_date: ATC_BUILD_DATE ?? null,
        admin_ui: ADMIN_BUILD_ID,
      },
      core: {
        version: snapshot.version,
        instance_id: snapshot.instance_id,
        pid: snapshot.pid,
        protocol: snapshot.protocol,
        uptime_ms: now() - startedAt,
      },
      daemon: { pid: process.pid, started_at: startedAt, data_folder: paths.dataFolder },
      admin: { host: admin?.host ?? '', port: admin?.port ?? 0, url: admin?.url ?? '' },
      api: snapshot.server,
      sessions: snapshot.sessions,
      pending_host_steps: (await hostSteps.pending()).map((e) => ({
        step_id: e.step_id,
        operation_id: e.operation_id,
        instructions: e.instructions ?? '',
        updated_at: e.updated_at,
      })),
    }
  }
  const configView = async (): Promise<AdminConfigView> => ({
    values: options.config.values,
    fields: FIELDS.map((f) => ({
      path: f.path,
      type: f.type,
      description: f.description,
      default: f.default,
      ...(f.values ? { values: f.values } : {}),
      source: options.config.sources[f.path] ?? 'default',
      ...(getAt(options.config.values, f.path) === undefined ? {} : {}),
    })),
  })
  if (options.admin.enabled) {
    await ensureAdminToken(paths.adminToken)
    admin = await AdminServer.start({
      host: options.admin.host ?? options.config.values.admin.host,
      port: options.admin.port ?? options.config.values.admin.port,
      link,
      relay,
      sessions: new SessionStore(),
      adminToken: () => ensureAdminToken(paths.adminToken),
      status,
      config: configView,
      workspace,
      log: log.child('admin'),
    })
  }

  const record: DaemonRecord = {
    ...startingRecord,
    state: 'ready',
    atc_version: ATC_VERSION,
    core_version: CORE_VERSION,
    control_url: controlUrl,
    admin_url: admin?.url ?? null,
    started_at: startedAt,
  }
  await writeDaemonRecord(paths.daemonRecord, record)
  log.info(`daemon ready: core ${CORE_VERSION} pid ${process.pid}, data ${paths.dataFolder}`)

  let cleanupOnce: Promise<void> | undefined
  const cleanup = () =>
    (cleanupOnce ??= (async () => {
      clearInterval(pendingTimer)
      offEvents()
      await admin?.close()
      await removeDaemonRecord(paths.daemonRecord, core.instanceId)
    })())
  const stopped = core.stopped.then(cleanup)
  return {
    core,
    link,
    admin,
    relay,
    record,
    hostSteps,
    stopped,
    shutdown: async () => {
      await core.shutdown()
      await cleanup()
    },
  }
}

/** Run as the foreground process until a signal or a control-API shutdown; the exit code. */
export async function runDaemon(options: DaemonOptions & { printReadyLine?: boolean }): Promise<number> {
  // Listen before starting: a signal during startup (the core, the hardware probe, the admin bind)
  // would otherwise kill the process with Node's default handler and leave `daemon.json` behind.
  const started: { daemon?: RunningDaemon } = {}
  let stopRequested = false
  let stopping: Promise<void> | undefined
  const stop = (d: RunningDaemon) => (stopping ??= d.shutdown())
  const signalled = options.io.waitForShutdown(async () => {
    stopRequested = true
    if (started.daemon) await stop(started.daemon)
  })
  const daemon = await startDaemon(options)
  started.daemon = daemon
  if (stopRequested) {
    await stop(daemon)
    return 0
  }
  if (options.printReadyLine !== false)
    options.io.stdout(
      `${JSON.stringify({ ...daemon.core.readyLine(), admin_url: daemon.record.admin_url })}\n`
    )
  await Promise.race([signalled, daemon.stopped])
  return 0
}
