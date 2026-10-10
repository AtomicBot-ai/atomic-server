/**
 * Getting a privileged step run. The helper is `atc` itself (`atc host-step exec <request>`),
 * re-invoked under whatever this session can offer: nothing (root), `sudo` on a terminal, `pkexec`
 * in a desktop session, UAC on Windows — or none of those, in which case the request file stays
 * where it is and the person is told the exact command to run.
 *
 * The privileged process never talks to the core: it reads the request file, does the work, writes
 * the result file and exits. The unprivileged daemon turns the result into the receipt.
 */

import type { ExecFn } from './exec.js'
import type {
  HostStepOutcomeKind,
  ManagedHostAction,
  ManagedHostStep,
  Sha256Digest,
} from './managed-types.js'

export type ElevationStrategy = 'root' | 'sudo-tty' | 'pkexec' | 'windows-runas' | 'manual'

export interface ElevationContext {
  platform: NodeJS.Platform
  isRoot: boolean
  isElevatedWindows: boolean | null
  hasTty: boolean
  hasDisplay: boolean
  hasPkexec: boolean
  hasSudo: boolean
  /** Inside the daemon there is no terminal to prompt on. */
  inDaemon: boolean
}

/** First match wins; see docs/architecture.md "Elevation". */
export function selectStrategy(ctx: ElevationContext): ElevationStrategy {
  if (ctx.platform === 'win32') {
    if (ctx.isElevatedWindows === true) return 'root'
    return ctx.inDaemon || ctx.hasTty ? 'windows-runas' : 'manual'
  }
  if (ctx.isRoot) return 'root'
  if (ctx.inDaemon && ctx.platform === 'linux' && ctx.hasDisplay && ctx.hasPkexec) return 'pkexec'
  if (!ctx.inDaemon && ctx.hasTty && ctx.hasSudo) return 'sudo-tty'
  return 'manual'
}

export interface HostStepRequestFile {
  schema_version: 1
  step_id: string
  operation_id: string
  action: ManagedHostAction
  recipe_id: string
  recipe_digest: Sha256Digest
  parameters_digest: Sha256Digest
  nonce: string
  expected_operation_revision: number
  data_folder: string
  requested_at: number
  /** The step's parameters, copied unchanged from `pending_host_step.parameters`. */
  parameters: ManagedHostStep['parameters']
}

export interface HostStepResultFile {
  schema_version: 1
  step_id: string
  outcome: HostStepOutcomeKind
  exit_code: number | null
  log_tail: string
  finished_at: number
}

export type HostStepOutcome =
  { kind: 'result'; result: HostStepResultFile } | { kind: 'pending'; instructions: string }

export interface Elevator {
  select(ctx: ElevationContext): ElevationStrategy
  run(strategy: ElevationStrategy, requestPath: string): Promise<HostStepOutcome>
}

export interface ElevatorDeps {
  exec: ExecFn
  /** How to re-run this program (`process.execPath` plus a script when running from source). */
  selfCommand: readonly string[]
  readResult: (requestPath: string) => Promise<HostStepResultFile | undefined>
}

/** The command a person runs by hand when no automatic strategy applies. */
export function manualInstructions(
  selfCommand: readonly string[],
  requestPath: string,
  platform: NodeJS.Platform
): string {
  const self = selfCommand.map(quote).join(' ')
  if (platform === 'win32')
    return `From an elevated (Administrator) PowerShell:\n  ${self} host-step exec ${quote(requestPath)}`
  return `sudo ${self} host-step exec ${quote(requestPath)}`
}

function quote(arg: string): string {
  return /[\s"']/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

export const ELEVATED_STEP_TIMEOUT_MS = 30 * 60_000

/** The command line for a strategy: what runs, with what, and which environment it starts from. */
export function elevatedCommand(
  strategy: Exclude<ElevationStrategy, 'manual'>,
  selfCommand: readonly string[],
  requestPath: string,
  env: NodeJS.ProcessEnv
): { command: string; args: string[]; env?: NodeJS.ProcessEnv; interactive: boolean } {
  const [exe = 'atc', ...prefix] = selfCommand
  const helper = [...prefix, 'host-step', 'exec', requestPath]
  switch (strategy) {
    case 'root': {
      // Already root: an inherited SUDO_UID/PKEXEC_UID (a server started with `sudo atc start`) would
      // make the executor trust only that user's folder, while this root process created its own.
      const { SUDO_UID: _sudo, PKEXEC_UID: _pkexec, ...clean } = env
      return { command: exe, args: helper, env: clean, interactive: true }
    }
    case 'sudo-tty':
      // -k: always ask on this terminal; never reuse a cached ticket for a privileged install.
      return { command: 'sudo', args: ['-k', '--', exe, ...helper], interactive: true }
    case 'pkexec':
      return { command: 'pkexec', args: [exe, ...helper], interactive: false }
    case 'windows-runas': {
      const quoted = helper.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')
      const script =
        `$p = Start-Process -FilePath '${exe.replace(/'/g, "''")}' -ArgumentList @(${quoted}) ` +
        '-Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode'
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command', script],
        interactive: false,
      }
    }
  }
}

/** A prompt the person dismissed: pkexec's 126, UAC's "canceled by the user", sudo's three wrong tries. */
export function wasDeclined(strategy: ElevationStrategy, code: number | null, stderr: string): boolean {
  if (strategy === 'pkexec') return code === 126
  if (strategy === 'windows-runas') return /cancel+ed by the user/i.test(stderr)
  if (strategy === 'sudo-tty') return /incorrect password attempts|a password is required/i.test(stderr)
  return false
}

export function createElevator(
  deps: ElevatorDeps & { env?: NodeJS.ProcessEnv },
  platform: NodeJS.Platform = process.platform
): Elevator {
  return {
    select: selectStrategy,
    async run(strategy, requestPath) {
      if (strategy === 'manual')
        return { kind: 'pending', instructions: manualInstructions(deps.selfCommand, requestPath, platform) }
      const line = elevatedCommand(strategy, deps.selfCommand, requestPath, deps.env ?? {})
      const result = await deps.exec(line.command, line.args, {
        timeoutMs: ELEVATED_STEP_TIMEOUT_MS,
        ...(line.interactive ? { stdio: 'inherit' as const } : {}),
        ...(line.env ? { env: line.env } : {}),
      })
      const file = await deps.readResult(requestPath)
      if (file) return { kind: 'result', result: file }
      // No result file: the helper never ran (a declined prompt) or could not write one.
      return {
        kind: 'result',
        result: {
          schema_version: 1,
          step_id: '',
          outcome: wasDeclined(strategy, result.code, result.stderr) ? 'declined' : 'failed',
          exit_code: result.code,
          log_tail:
            (result.error ?? result.stderr.slice(-2000)) || `${line.command} exited with ${result.code}`,
          finished_at: Date.now(),
        },
      }
    },
  }
}
