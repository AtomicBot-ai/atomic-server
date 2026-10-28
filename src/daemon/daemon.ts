/**
 * The long-lived `atc` process: the core in-process (owner of the data folder), the admin server,
 * the host-step loop for managed runtimes, and
 * the run record that tells commands this owner is an `atc` daemon. Everything else is a command
 * that attaches to it.
 */

import { mkdir } from 'node:fs/promises'
import { WorkspaceService, sanitizeWorkspaceData } from '../workspace-service/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { telemetryConsent } from '../telemetry/index.js'
import type { AtcErrorReporter } from '../telemetry/index.js'
import { AtomicCore } from '@atomic-chat/core'
import { patientCoreClient } from '../core-link/index.js'
import { AdminServer, ensureAdminToken, RelayHub, SessionStore } from '../admin/index.js'
import type { AtcPaths, ResolvedConfig } from '../config/index.js'
import { HttpCoreLink, InProcessEvents, removeDaemonRecord, writeDaemonRecord } from '../core-link/index.js'
import type { CoreLink, DaemonRecord } from '../core-link/index.js'
import { HostStepExecutor, HostStepJournal, readServerLaunch, restrictToOwner } from '../host/index.js'
import type { EnvironmentOperationView, HostServices } from '../host/index.js'
import type { AtcIo } from '../io.js'
import type { Logger } from '../output/index.js'
import { ATC_VERSION, CORE_VERSION } from '../version.js'
import { coreEnv } from './core-env.js'
import { adminConfigView, adminStatus } from './admin-views.js'
import { engineOutputSink } from './engine-log.js'
import { CrashPolicy, watchSessions } from './session-watch.js'
import { bootLoader, bootPlan, runBoot } from './boot.js'
import { startApi } from '../terminal-service/index.js'
import { serverReleaseWatch } from './release-check.js'
import type { ReleaseWatch } from '../update/index.js'

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
  /** atc's own error reports; the core's consent decides for them once it runs. */
  errors?: Pick<AtcErrorReporter, 'capture' | 'flush' | 'follow'>
  now?: () => number
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
  /** Its look at atc releases; `check()` runs one now (the tests do, instead of waiting a day). */
  releases: ReleaseWatch
  stopped: Promise<void>
  /** `api.autoStart` and `models.autoLoad`, done after the ready record; never rejects. */
  boot: Promise<void>
  shutdown(): Promise<void>
}

const PENDING_POLL_MS = 2_000
/** A model that died is loaded again, at most this often; past it the log says to run it by hand. */
const CRASH_RESTARTS = { maxRestarts: 3, windowMs: 10 * 60_000 }

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
    env: io.env,
    checked: (problem) =>
      problem
        ? log.warn(`could not restrict ${paths.atcDir} to this user: ${problem}`)
        : log.info(`restricted ${paths.atcDir} to this user`),
  })
  if (denied) log.warn(`could not restrict ${paths.atcDir} to this user: ${denied}`)
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
    // TF_BUILD=True on Linux: Foundry Local's 1DS upload crashes its host there (ADR 2026-10-21).
    env: coreEnv(io.env, host.facts.platform),
    logger: (level, message) => coreLog[level](message),
    // Every engine line, by provider and model: what a crash said, for `atc models logs`.
    backendOutput: engineOutputSink(paths.engineLog, {
      maxSizeBytes: options.config.values.log.maxSizeMb * 1024 * 1024,
      maxFiles: options.config.values.log.maxFiles,
    }),
    telemetry: {
      host: 'atc',
      hostVersion: ATC_VERSION,
      // Only an explicit choice: the default would override DO_NOT_TRACK and the core's stored consent.
      ...(consent !== undefined ? { enabled: consent } : {}),
    },
  })
  // Anything that fails from here on gives the folder back: the core stops and releases its lock, and
  // no record says an atc server is on its way. Steps undo in reverse; each is registered as it starts.
  const undo: Array<() => unknown> = [
    () => core.shutdown(),
    () => removeDaemonRecord(paths.daemonRecord, core.instanceId),
  ]
  options.errors?.follow(core.telemetry)
  try {
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
      ...(await readServerLaunch(host.facts.platform, io.env)),
    }
    await writeDaemonRecord(paths.daemonRecord, startingRecord)
    const relay = new RelayHub()
    const controlUrl = `http://${core.control.host}:${core.control.port}`
    const client = patientCoreClient({ baseUrl: controlUrl, token: core.controlToken, name: 'atc-daemon' })
    const link = new HttpCoreLink({
      endpoint: { baseUrl: controlUrl, instanceId: core.instanceId, version: CORE_VERSION, pid: process.pid },
      client,
      events: new InProcessEvents(core, () => client.snapshot()),
      pid: process.pid,
      log: (m) => log.debug(m),
    })

    const releases = await serverReleaseWatch({ io, host, log })
    undo.push(() => releases.stop())
    const workspace = new WorkspaceService({
      link,
      paths,
      config: options.config.values,
      fetch: io.fetch,
      atc: () => releases.view(),
      platform: host.facts.platform,
      selfCommand: host.selfCommand,
      // Models are downloaded here, not by the core: `HF_TOKEN` reaches gated repositories.
      env: io.env,
      probePort: host.probePort,
      ...(options.errors ? { errors: options.errors } : {}),
    })
    // A failed move leaves media where it was: its records still name those paths, so it still loads.
    await workspace
      .start()
      .then(({ kept }) => {
        for (const folder of kept)
          log.warn(`media ${folder} stays in workspace-models: diffusion/models already has that family`)
      })
      .catch((e: unknown) => log.warn(`media folders were not moved: ${String(e)}`))
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
    const sessions = watchSessions({
      reload: (provider, model) => workspace.execute('models.load', { provider, model_id: model }),
      log,
      policy: new CrashPolicy(CRASH_RESTARTS),
    })
    const offEvents = core.events.onAny((record) => {
      relay.publish(record.name, sanitizeWorkspaceData(record.payload))
      workspace.event(String(record.name), record.payload)
      void sessions.handle(String(record.name), record.payload)
      if (String(record.name) === 'environment:operation') {
        void hostSteps
          .handle(record.payload as unknown as EnvironmentOperationView)
          .catch((e: unknown) => log.warn(`host step failed: ${String(e)}`))
      }
    })
    const pendingTimer = setInterval(() => {
      void hostSteps
        .checkPendingResults()
        .catch((e: unknown) => log.debug(`pending host steps: ${String(e)}`))
    }, PENDING_POLL_MS)
    pendingTimer.unref?.()
    undo.push(() => clearInterval(pendingTimer), offEvents)

    let admin: AdminServer | undefined
    const status = adminStatus({
      link,
      hostSteps,
      paths,
      record: startingRecord,
      admin: () => admin,
      startedAt,
      now,
    })
    const configView = adminConfigView(options.config)
    if (options.admin.enabled) {
      await ensureAdminToken(paths.adminToken)
      undo.push(() => admin?.close())
      admin = await AdminServer.start({
        host: options.admin.host ?? options.config.values.admin.host,
        port: options.admin.port ?? options.config.values.admin.port,
        link,
        relay,
        sessions: new SessionStore(undefined, undefined, paths.adminSessions),
        adminToken: () => ensureAdminToken(paths.adminToken),
        status,
        config: configView,
        workspace,
        log: log.child('admin'),
        ...(options.errors ? { errors: options.errors } : {}),
      })
    }

    // The API before the ready record: `atc start` returns on the record and shows the API's state.
    // The models after it: a slow load must not hold `atc start` up.
    const config = options.config.values
    const plan = bootPlan(config)
    const bootDeps = {
      startApi: () => startApi(link, config, keys.current()?.[0] ?? '', { probePort: host.probePort }),
      loadModel: bootLoader((op, input) => workspace.execute(op, input), config.engines.default),
      log,
    }
    await runBoot({ ...plan, models: [] }, bootDeps)
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
    // After the ready record: a slow GitHub answers nobody who waits on `atc start`.
    if (config.update.checkOnStart) releases.start()
    const boot = runBoot({ startApi: false, models: plan.models }, bootDeps)

    let cleanupOnce: Promise<void> | undefined
    const cleanup = () =>
      (cleanupOnce ??= (async () => {
        sessions.stop()
        releases.stop()
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
      releases,
      stopped,
      boot,
      shutdown: async () => {
        sessions.stop()
        await core.shutdown()
        await cleanup()
      },
    }
  } catch (error) {
    for (const step of undo.reverse())
      await Promise.resolve()
        .then(step)
        .catch(() => undefined)
    throw error
  }
}
