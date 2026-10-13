/**
 * `atc doctor`: a table of checks, each pure given what it is handed, run in order and rendered as
 * ok / warn / fail / skip with a hint. The admin dashboard renders the same table.
 */

import { access, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AtcPaths } from '../config/index.js'
import { readTextFile, resolveConfig } from '../config/index.js'
import type { DaemonRecord } from '../core-link/index.js'
import { readDaemonRecord } from '../core-link/index.js'
import type { HostServices } from '../host/index.js'
import { installLabel } from '../update/index.js'
import type { InstallInfo } from '../update/index.js'
import { ATC_VERSION, CORE_VERSION } from '../version.js'

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip'

export interface CheckResult {
  id: string
  title: string
  status: CheckStatus
  message: string
  hint?: string
}

export interface CheckContext {
  paths: AtcPaths
  host: HostServices
  env: NodeJS.ProcessEnv
  apiPort: number
  adminPort: number
  install: InstallInfo
}

export interface Check {
  id: string
  title: string
  run(ctx: CheckContext): Promise<Omit<CheckResult, 'id' | 'title'>>
}

export const CHECKS: Check[] = [
  {
    id: 'version',
    title: 'atc and core versions',
    run: async () => ({ status: 'ok', message: `atc ${ATC_VERSION}, core ${CORE_VERSION}` }),
  },
  {
    id: 'install',
    title: 'how atc was installed',
    run: async (ctx) => ({
      status: 'ok',
      message: `${ctx.install.path} (${installLabel(ctx.install.kind)})`,
    }),
  },
  {
    id: 'data-folder',
    title: 'data folder is writable',
    run: async (ctx) => {
      try {
        await mkdir(ctx.paths.atcDir, { recursive: true })
        const probe = join(ctx.paths.atcDir, `.doctor-${process.pid}`)
        await writeFile(probe, 'ok')
        await rm(probe, { force: true })
        return { status: 'ok', message: ctx.paths.dataFolder }
      } catch (error) {
        return {
          status: 'fail',
          message: `${ctx.paths.dataFolder}: ${(error as Error).message}`,
          hint: 'pass --data-folder with a writable folder',
        }
      }
    },
  },
  {
    id: 'config',
    title: 'config file parses',
    run: async (ctx) => {
      const text = await readTextFile(ctx.paths.configFile)
      if (text === undefined) return { status: 'ok', message: 'no config file; defaults apply' }
      try {
        const resolved = resolveConfig({ fileText: text, env: ctx.env })
        return resolved.warnings.length
          ? { status: 'warn', message: resolved.warnings.join('; ') }
          : { status: 'ok', message: ctx.paths.configFile }
      } catch (error) {
        return { status: 'fail', message: (error as Error).message, hint: `fix ${ctx.paths.configFile}` }
      }
    },
  },
  {
    id: 'daemon',
    title: 'server',
    run: async (ctx) => {
      const record: DaemonRecord | undefined = await readDaemonRecord(ctx.paths.daemonRecord)
      if (!record) return { status: 'ok', message: 'not running' }
      return {
        status: 'ok',
        message: `pid ${record.pid}, core ${record.core_version}${record.admin_url ? `, admin ${record.admin_url}` : ''}`,
      }
    },
  },
  {
    id: 'ports',
    title: 'API and admin ports',
    run: async (ctx) => {
      const [api, admin] = await Promise.all([
        ctx.host.probePort('127.0.0.1', ctx.apiPort),
        ctx.host.probePort('127.0.0.1', ctx.adminPort),
      ])
      const record = await readDaemonRecord(ctx.paths.daemonRecord)
      const ours = record !== undefined
      const busy = [
        api === 'busy' ? `${ctx.apiPort}` : undefined,
        admin === 'busy' ? `${ctx.adminPort}` : undefined,
      ].filter(Boolean)
      if (busy.length === 0) return { status: 'ok', message: `${ctx.apiPort} and ${ctx.adminPort} are free` }
      return ours
        ? { status: 'ok', message: `${busy.join(', ')} in use (the server)` }
        : {
            status: 'warn',
            message: `${busy.join(', ')} in use by another program`,
            hint: '`atc config set api.port <port>` / `admin.port`',
          }
    },
  },
  {
    id: 'on-path',
    title: 'atc on PATH',
    run: async (ctx) => {
      const found = ctx.host.findOnPath('atc')
      return found
        ? { status: 'ok', message: found }
        : {
            status: 'warn',
            message: 'not on PATH',
            hint:
              ctx.install.kind === 'release' || ctx.install.kind === 'source'
                ? 'the installer adds ~/.local/bin (or %LOCALAPPDATA%\\atc) to PATH; open a new shell'
                : 'the package installs /usr/bin/atc; check that /usr/bin is on PATH',
          }
    },
  },
  {
    id: 'gpu',
    title: 'GPU driver',
    run: async (ctx) => {
      const smi = ctx.host.findOnPath('nvidia-smi')
      if (!smi)
        return { status: 'skip', message: 'nvidia-smi not found; AMD/Intel checks land in iteration 4' }
      const result = await ctx.host.exec(smi, ['--query-gpu=name,driver_version', '--format=csv,noheader'])
      return result.code === 0
        ? { status: 'ok', message: result.stdout.trim().split('\n')[0] ?? '' }
        : { status: 'warn', message: 'nvidia-smi failed', hint: 'check the NVIDIA driver' }
    },
  },
  {
    id: 'docker',
    title: 'container runtime (managed engines)',
    run: async () => ({ status: 'skip', message: 'probing Docker/WSL lands in iteration 4' }),
  },
]

export async function runChecks(checks: Check[], ctx: CheckContext): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const check of checks) {
    try {
      results.push({ id: check.id, title: check.title, ...(await check.run(ctx)) })
    } catch (error) {
      results.push({ id: check.id, title: check.title, status: 'fail', message: (error as Error).message })
    }
  }
  return results
}

export function worstStatus(results: CheckResult[]): CheckStatus {
  if (results.some((r) => r.status === 'fail')) return 'fail'
  if (results.some((r) => r.status === 'warn')) return 'warn'
  return 'ok'
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
