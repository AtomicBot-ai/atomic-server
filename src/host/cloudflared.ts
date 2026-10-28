/**
 * Finding Cloudflare's tunnel program for remote access. The desktop app ships `cloudflared` beside
 * itself; atc ships no programs, so the server looks where the program's own installers put it and
 * hands the core that path (ADR 2026-10-28-the-server-finds-cloudflared).
 */
import { existsSync } from 'node:fs'
import { win32 } from 'node:path'
import { fileIsExecutable, findOnPath } from './exec.js'

/** The core's own variable for an explicit `cloudflared`; a path there wins, as it does in the core. */
const CLOUDFLARED_BIN_ENV = 'ATOMIC_CLOUDFLARED_BIN'

/** Which install commands fit this Linux: what its package manager and Cloudflare's repositories are. */
export type LinuxFamily = 'debian' | 'fedora' | 'arch'

/**
 * Where `cloudflared`'s installers put it, searched after PATH: a launchd job's PATH has no Homebrew,
 * and the MSI's PATH entry reaches only processes started after it.
 */
function installFolders(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] {
  if (platform === 'darwin') return ['/opt/homebrew/bin', '/usr/local/bin']
  if (platform === 'win32')
    return [env['ProgramFiles'], env['ProgramFiles(x86)']]
      .filter((dir): dir is string => Boolean(dir))
      .map((dir) => win32.join(dir, 'cloudflared'))
  return ['/usr/local/bin', '/usr/bin', `${home}/.local/bin`]
}

/** The `cloudflared` the core should run, or undefined when this machine has none. */
export function findCloudflared(options: {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  home: string
  exists?: (path: string) => boolean
  /** Whether a named file is there at all: the core tries any that is, runnable or not. */
  present?: (path: string) => boolean
}): string | undefined {
  const { platform, env, home } = options
  const exists = options.exists ?? fileIsExecutable
  // A named path is the only one the core tries: one that is not there means no cloudflared.
  const named = env[CLOUDFLARED_BIN_ENV]?.trim()
  if (named) return (options.present ?? existsSync)(named) ? named : undefined
  const separator = platform === 'win32' ? ';' : ':'
  const path = [env['PATH'] ?? env['Path'] ?? '', ...installFolders(platform, env, home)]
    .filter(Boolean)
    .join(separator)
  return findOnPath('cloudflared', { ...env, PATH: path }, platform, exists)
}

/** The family `/etc/os-release` names (its ID, then ID_LIKE), or null for one we have no commands for. */
export function linuxFamily(osRelease: string): LinuxFamily | null {
  const field = (name: string) =>
    new RegExp(`^${name}=["']?([^"'\\n]*)`, 'm').exec(osRelease)?.[1]?.toLowerCase().split(/\s+/) ?? []
  const families: Record<string, LinuxFamily> = {
    debian: 'debian',
    ubuntu: 'debian',
    fedora: 'fedora',
    rhel: 'fedora',
    centos: 'fedora',
    arch: 'arch',
  }
  for (const id of [...field('ID'), ...field('ID_LIKE')]) if (families[id]) return families[id]
  return null
}
