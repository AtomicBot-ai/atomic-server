/**
 * Where everything lives. The data folder is the core's CLI-scope folder (`<system data>/
 * atomic-chat-cli/data`, never the desktop app's), resolved by the core's own rules so both agree;
 * `atc/` inside it holds what only `atc` owns. Pure: the environment is injected.
 */

import { posix, win32 } from 'node:path'
import { assertCliDataFolder, dataLayout, resolveCliDataFolder } from '@atomic-chat/core/host'
import type { DataFolderEnv, DataLayout } from '@atomic-chat/core/host'
import { AtcError } from '../errors/index.js'

/** `atc`'s own override; the core's `ATOMIC_CORE_DATA_FOLDER` is only consulted by the assert. */
export const ATC_DATA_FOLDER_ENV = 'ATC_DATA_FOLDER'

export interface AtcPaths {
  dataFolder: string
  /** The core's layout of the same folder. */
  layout: DataLayout
  atcDir: string
  configFile: string
  secretsFile: string
  runDir: string
  daemonRecord: string
  adminToken: string
  hostStepsDir: string
  hostStepsJournal: string
  logsDir: string
  /** The server's own log, written and rotated by its logger. */
  daemonLog: string
  /** The server process's stdout and stderr from its last start (crash output before the logger is up). */
  daemonOutLog: string
  cacheDir: string
}

/** The injected platform's path rules, never the host's, so the Windows branches are testable anywhere. */
export function atcPathsFor(dataFolder: string, platform: NodeJS.Platform = process.platform): AtcPaths {
  const { join } = platform === 'win32' ? win32 : posix
  const atcDir = join(dataFolder, 'atc')
  const runDir = join(atcDir, 'run')
  const logsDir = join(atcDir, 'logs')
  return {
    dataFolder,
    layout: dataLayout(dataFolder),
    atcDir,
    configFile: join(atcDir, 'config.json'),
    secretsFile: join(atcDir, 'secrets.json'),
    runDir,
    daemonRecord: join(runDir, 'daemon.json'),
    adminToken: join(runDir, 'admin-token'),
    hostStepsDir: join(runDir, 'host-steps'),
    hostStepsJournal: join(runDir, 'host-steps', 'journal.json'),
    logsDir,
    daemonLog: join(logsDir, 'daemon.log'),
    daemonOutLog: join(logsDir, 'daemon.out.log'),
    cacheDir: join(atcDir, 'cache'),
  }
}

/** `--data-folder` > `ATC_DATA_FOLDER` > the core's CLI default; the app's folder is refused. */
export function resolveAtcPaths(env: DataFolderEnv, override?: string, cwd?: string): AtcPaths {
  const fromEnv = env.env[ATC_DATA_FOLDER_ENV]
  const selected = override ?? (fromEnv && fromEnv.trim() !== '' ? fromEnv : resolveCliDataFolder(env))
  // Resolve once at CLI entry, before the server or an engine changes its working directory.
  const folder = cwd ? (env.platform === 'win32' ? win32 : posix).resolve(cwd, selected) : selected
  try {
    assertCliDataFolder(folder, env)
  } catch (error) {
    throw new AtcError('ATC_CONFIG_INVALID', (error as Error).message, {
      hint: 'pass --data-folder with a folder of its own',
    })
  }
  return atcPathsFor(folder, env.platform)
}
