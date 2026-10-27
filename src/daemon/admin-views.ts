/** What the admin reads of the server itself: its status (atc, core, API, sessions, host steps) and the config table. */

import type { AdminConfigView, AdminStatus } from '../contract/index.js'
import type { AtcPaths, ResolvedConfig } from '../config/index.js'
import { FIELDS } from '../config/index.js'
import type { CoreLink, DaemonRecord } from '../core-link/index.js'
import type { HostStepExecutor } from '../host/index.js'
import { ADMIN_BUILD_ID } from '../admin/index.js'
import { ATC_BUILD_DATE, ATC_GIT_SHA, ATC_VERSION } from '../version.js'

export interface StatusDeps {
  link: CoreLink
  hostSteps: Pick<HostStepExecutor, 'pending'>
  paths: Pick<AtcPaths, 'dataFolder'>
  record: Pick<DaemonRecord, 'launch'>
  admin: () => { host: string; port: number; url: string } | undefined
  startedAt: number
  now: () => number
}

export function adminStatus(d: StatusDeps): () => Promise<AdminStatus> {
  return async () => {
    const snapshot = await d.link.snapshot()
    const admin = d.admin()
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
        uptime_ms: d.now() - d.startedAt,
      },
      daemon: { pid: process.pid, started_at: d.startedAt, data_folder: d.paths.dataFolder },
      launch: d.record.launch ?? 'terminal',
      admin: { host: admin?.host ?? '', port: admin?.port ?? 0, url: admin?.url ?? '' },
      api: snapshot.server,
      sessions: snapshot.sessions,
      pending_host_steps: (await d.hostSteps.pending()).map((e) => ({
        step_id: e.step_id,
        operation_id: e.operation_id,
        instructions: e.instructions ?? '',
        updated_at: e.updated_at,
      })),
    }
  }
}

export function adminConfigView(config: ResolvedConfig): () => Promise<AdminConfigView> {
  return async () => ({
    values: config.values,
    fields: FIELDS.map((f) => ({
      path: f.path,
      type: f.type,
      description: f.description,
      default: f.default,
      ...(f.values ? { values: f.values } : {}),
      source: config.sources[f.path] ?? 'default',
    })),
  })
}
