/** Facts about the machine and the session `atc` runs in, gathered once and injected everywhere. */

import { hostname, userInfo } from 'node:os'
import type { AtcIo } from '../io.js'
import type { ExecFn } from './exec.js'
import { findOnPath } from './exec.js'

export interface HostFacts {
  platform: NodeJS.Platform
  arch: string
  /** Effective uid, null on Windows. */
  euid: number | null
  isRoot: boolean
  /** Null when not on Windows or not yet probed. */
  isElevatedWindows: boolean | null
  hasTty: boolean
  /** A graphical session (`DISPLAY`/`WAYLAND_DISPLAY`), where a polkit agent can prompt. */
  hasDisplay: boolean
  hasSudo: boolean
  hasPkexec: boolean
  username: string
  homedir: string
  hostname: string
}

export interface FactsInput {
  platform: NodeJS.Platform
  arch: string
  env: NodeJS.ProcessEnv
  hasTty: boolean
  euid: number | null
  username: string
  homedir: string
  hostname: string
  onPath: (name: string) => boolean
  isElevatedWindows?: boolean | null
}

export function hostFacts(input: FactsInput): HostFacts {
  const win = input.platform === 'win32'
  return {
    platform: input.platform,
    arch: input.arch,
    euid: input.euid,
    isRoot: !win && input.euid === 0,
    isElevatedWindows: win ? (input.isElevatedWindows ?? null) : null,
    hasTty: input.hasTty,
    hasDisplay: Boolean(input.env['DISPLAY'] || input.env['WAYLAND_DISPLAY']) || input.platform === 'darwin',
    hasSudo: !win && input.onPath('sudo'),
    hasPkexec: input.platform === 'linux' && input.onPath('pkexec'),
    username: input.username,
    homedir: input.homedir,
    hostname: input.hostname,
  }
}

export function nodeHostFacts(io: AtcIo): HostFacts {
  const user = userInfo()
  return hostFacts({
    platform: process.platform,
    arch: process.arch,
    env: io.env,
    hasTty: io.isTTY.stdin && io.isTTY.stderr,
    euid: typeof process.geteuid === 'function' ? process.geteuid() : null,
    username: user.username,
    homedir: user.homedir,
    hostname: hostname(),
    onPath: (name) => findOnPath(name, io.env, process.platform) !== undefined,
  })
}

const ELEVATION_PROBE =
  "[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"

/** True only when Windows PowerShell reports the process is in the Administrators role. */
export async function probeElevatedWindows(exec: ExecFn): Promise<boolean> {
  const result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ELEVATION_PROBE], {
    timeoutMs: 20_000,
  })
  return result.code === 0 && !result.timedOut && !result.error && result.stdout.trim().toLowerCase() === 'true'
}

/** Copy with Windows elevation filled in. A known value, and every other platform, is unchanged. */
export async function probedFacts(facts: HostFacts, exec: ExecFn): Promise<HostFacts> {
  if (facts.platform !== 'win32' || facts.isElevatedWindows !== null) return facts
  return { ...facts, isElevatedWindows: await probeElevatedWindows(exec) }
}

/** `--system` needs an elevated Windows token, or root elsewhere. Unknown elevation denies. */
export function systemInstallDenied(facts: HostFacts): boolean {
  return facts.platform === 'win32' ? facts.isElevatedWindows !== true : !facts.isRoot
}
