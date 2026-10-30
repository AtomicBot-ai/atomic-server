/**
 * What installing, removing, starting and stopping the service does on each platform, as a list of
 * steps (pure, table-tested), and the runner that performs them with injected `exec` and files.
 */

import { AtcError } from '../errors/index.js'
import type { ExecFn, ExecResult } from './exec.js'
import {
  launchdLabel,
  launchdPlist,
  scheduledTaskXml,
  servicePathFor,
  systemdUnit,
} from './service-manager.js'
import type { ServiceEnv, ServiceManager, ServiceOptions, ServiceState } from './service-manager.js'
import { readTaskStatus, taskStatusProbe } from './service-task-status.js'

export type ServiceStep =
  | { kind: 'write'; path: string; content: string; encoding?: 'utf8' | 'utf16le' }
  | { kind: 'remove'; path: string }
  | { kind: 'exec'; command: string; args: string[]; ignoreFailure?: boolean }

export type ServiceAction = 'start' | 'stop' | 'restart'

const exec = (command: string, args: string[], ignoreFailure = false): ServiceStep => ({
  kind: 'exec',
  command,
  args,
  ...(ignoreFailure ? { ignoreFailure } : {}),
})

const systemctl = (o: ServiceOptions, ...args: string[]): string[] => [
  ...(o.system ? [] : ['--user']),
  ...args,
]
const unitName = (o: ServiceOptions) => `${o.name}.service`
const launchdDomain = (o: ServiceOptions, env: ServiceEnv) => (o.system ? 'system' : `gui/${env.uid ?? 0}`)
const launchdTarget = (o: ServiceOptions, env: ServiceEnv) =>
  `${launchdDomain(o, env)}/${launchdLabel(o.name)}`
/** The task XML is written next to the data folder for `schtasks /XML`, then removed. */
export const taskXmlPath = (o: ServiceOptions) => `${o.dataFolder}/atc/run/${o.name}.task.xml`

export function installPlan(platform: NodeJS.Platform, o: ServiceOptions, env: ServiceEnv): ServiceStep[] {
  const path = servicePathFor(platform, o, env.home)
  if (platform === 'linux')
    return [
      { kind: 'write', path, content: systemdUnit(o) },
      exec('systemctl', systemctl(o, 'daemon-reload')),
      exec('systemctl', systemctl(o, 'enable', '--now', unitName(o))),
    ]
  if (platform === 'darwin')
    return [
      { kind: 'write', path, content: launchdPlist(o) },
      // A job of the same label from an earlier install must go first; bootstrap refuses a duplicate.
      exec('launchctl', ['bootout', launchdTarget(o, env)], true),
      exec('launchctl', ['bootstrap', launchdDomain(o, env), path]),
    ]
  const xml = taskXmlPath(o)
  return [
    { kind: 'write', path: xml, content: `\ufeff${scheduledTaskXml(o, env)}`, encoding: 'utf16le' },
    exec('schtasks', ['/Create', '/F', '/TN', o.name, '/XML', xml]),
    { kind: 'remove', path: xml },
    exec('schtasks', ['/Run', '/TN', o.name]),
  ]
}

export function uninstallPlan(platform: NodeJS.Platform, o: ServiceOptions, env: ServiceEnv): ServiceStep[] {
  const path = servicePathFor(platform, o, env.home)
  if (platform === 'linux')
    return [
      exec('systemctl', systemctl(o, 'disable', '--now', unitName(o)), true),
      { kind: 'remove', path },
      exec('systemctl', systemctl(o, 'daemon-reload')),
    ]
  if (platform === 'darwin')
    return [exec('launchctl', ['bootout', launchdTarget(o, env)], true), { kind: 'remove', path }]
  return [exec('schtasks', ['/End', '/TN', o.name], true), exec('schtasks', ['/Delete', '/F', '/TN', o.name])]
}

/**
 * Start, stop or restart the installed service. systemd and launchd stop with SIGTERM, which the
 * server treats as a graceful stop; a scheduled task has no signal, so on Windows the caller stops the
 * server through its control API first and `/End` only clears the task's state.
 */
export function controlPlan(
  platform: NodeJS.Platform,
  o: ServiceOptions,
  env: ServiceEnv,
  action: ServiceAction
): ServiceStep[] {
  if (platform === 'linux') return [exec('systemctl', systemctl(o, action, unitName(o)))]
  if (platform === 'darwin') {
    const target = launchdTarget(o, env)
    if (action === 'start') return [exec('launchctl', ['kickstart', target])]
    if (action === 'restart') return [exec('launchctl', ['kickstart', '-k', target])]
    return [exec('launchctl', ['kill', 'SIGTERM', target], true)]
  }
  if (action === 'start') return [exec('schtasks', ['/Run', '/TN', o.name])]
  if (action === 'stop') return [exec('schtasks', ['/End', '/TN', o.name], true)]
  return [exec('schtasks', ['/End', '/TN', o.name], true), exec('schtasks', ['/Run', '/TN', o.name])]
}

/** The command that tells whether the service runs, and how to read its answer. */
export function statusProbe(
  platform: NodeJS.Platform,
  o: ServiceOptions,
  env: ServiceEnv
): { command: string; args: string[]; running: (r: ExecResult) => boolean | null } {
  if (platform === 'linux')
    return {
      command: 'systemctl',
      args: systemctl(o, 'is-active', unitName(o)),
      running: (r) => (r.error ? null : r.stdout.trim() === 'active'),
    }
  if (platform === 'darwin')
    return {
      command: 'launchctl',
      args: ['print', launchdTarget(o, env)],
      running: (r) => (r.error ? null : r.code === 0 && /\bstate = running\b/.test(r.stdout)),
    }
  return {
    ...taskStatusProbe(o.name, env),
    running: (r) => readTaskStatus(r).running,
  }
}

export interface ServiceFiles {
  write(path: string, content: string, encoding: 'utf8' | 'utf16le'): Promise<void>
  remove(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

export interface ServiceManagerDeps {
  platform: NodeJS.Platform
  env: ServiceEnv
  exec: ExecFn
  files: ServiceFiles
}

export const SERVICE_EXEC_TIMEOUT_MS = 60_000

export async function runServiceSteps(
  steps: readonly ServiceStep[],
  deps: ServiceManagerDeps
): Promise<void> {
  for (const step of steps) {
    if (step.kind === 'write') await deps.files.write(step.path, step.content, step.encoding ?? 'utf8')
    else if (step.kind === 'remove') await deps.files.remove(step.path)
    else {
      const r = await deps.exec(step.command, step.args, { timeoutMs: SERVICE_EXEC_TIMEOUT_MS })
      if (!step.ignoreFailure && (r.error || r.code !== 0)) {
        throw new AtcError('ATC_SERVICE_FAILED', `\`${step.command} ${step.args.join(' ')}\` failed.`, {
          details: (r.error ?? r.stderr.trim()) || r.stdout.trim() || `exit code ${r.code}`,
        })
      }
    }
  }
}

export function createServiceManager(deps: ServiceManagerDeps): ServiceManager {
  const { platform, env } = deps
  const kind = platform === 'linux' ? 'systemd' : platform === 'darwin' ? 'launchd' : 'task'
  const run = (steps: ServiceStep[]) => runServiceSteps(steps, deps)
  return {
    kind,
    install: (o) => run(installPlan(platform, o, env)),
    uninstall: (o) => run(uninstallPlan(platform, o, env)),
    start: (o) => run(controlPlan(platform, o, env, 'start')),
    stop: (o) => run(controlPlan(platform, o, env, 'stop')),
    restart: (o) => run(controlPlan(platform, o, env, 'restart')),
    status: async (o): Promise<ServiceState> => {
      const definition = servicePathFor(platform, o, env.home)
      const probe = statusProbe(platform, o, env)
      const r = await deps.exec(probe.command, probe.args, { timeoutMs: SERVICE_EXEC_TIMEOUT_MS })
      if (kind === 'task') return { ...readTaskStatus(r), definition }
      const installed = await deps.files.exists(definition)
      return { installed, running: installed ? probe.running(r) : false, definition }
    },
  }
}
