/**
 * What a command runs against: I/O, flags, paths, the (lazily read) config, output helpers, the
 * core link factory and host services. `bin.ts` builds it from the real process; tests build it
 * from `recordingIo()` and fakes, so a command never touches a global.
 */

import { nodeDataFolderEnv } from '@atomic-chat/core/host'
import type { AtcPaths, ResolvedConfig } from '../config/index.js'
import { readTextFile, resolveAtcPaths, resolveConfig } from '../config/index.js'
import type { CoreLink } from '../core-link/index.js'
import { attachCore } from '../core-link/index.js'
import { AtcError } from '../errors/index.js'
import type { HostServices } from '../host/index.js'
import { nodeHostServices } from '../host/index.js'
import type { AtcIo } from '../io.js'
import type { Colors, Logger, Printer as PrinterType, Prompter } from '../output/index.js'
import {
  colorEnabled,
  colorsFor,
  createLogger,
  createProgress,
  createPrompter,
  levelFromFlags,
  Printer,
  stderrSink,
} from '../output/index.js'
import type { CommandSpec } from './command.js'
import type { GlobalFlags } from './flags.js'

export interface CoreLinkFactory {
  /**
   * Attach to the daemon owning the data folder; with `launch`, start one when there is none.
   * `log` replaces the command's stderr logger (the terminal UI must not write under its frame).
   */
  attach(options?: { launch?: boolean; daemonArgs?: readonly string[]; log?: Logger }): Promise<CoreLink>
}

export interface ContextDeps {
  io: AtcIo
  flags: GlobalFlags
  paths?: AtcPaths
  loadConfig?: () => Promise<ResolvedConfig>
  core?: CoreLinkFactory
  host?: HostServices
  /** How the context starts a daemon; the composition root supplies it (avoids a cli ↔ daemon cycle). */
  spawnDaemon?: (paths: AtcPaths, log: Logger, args: readonly string[]) => Promise<void>
  /** The command tree, for completion and help from inside a command. */
  root?: CommandSpec
  now?: () => Date
  signal?: AbortSignal
  pid?: number
}

export interface CommandContext {
  io: AtcIo
  flags: GlobalFlags
  paths: AtcPaths
  /** Read and validated on first use, so `atc version` works with a broken config file. */
  config(): Promise<ResolvedConfig>
  out: PrinterType
  log: Logger
  prompt: Prompter
  colors: Colors
  progress: ReturnType<typeof createProgress>
  core: CoreLinkFactory
  host: HostServices
  now: () => Date
  signal: AbortSignal
  pid: number
  root: CommandSpec
}

export function createContext(deps: ContextDeps): CommandContext {
  const { io, flags } = deps
  const colors = colorsFor(colorEnabled({ isTTY: io.isTTY.stderr, env: io.env, noColor: flags.noColor }))
  const log = createLogger(stderrSink(io, { json: flags.json, colors }), { level: levelFromFlags(flags) })
  const paths = deps.paths ?? resolveAtcPaths(nodeDataFolderEnv(io.env), flags.dataFolder, io.cwd)
  const host = deps.host ?? nodeHostServices(io)
  const pid = deps.pid ?? process.pid
  let config: Promise<ResolvedConfig> | undefined
  const loadConfig =
    deps.loadConfig ??
    (async () => {
      const text = await readTextFile(paths.configFile)
      const resolved = resolveConfig({ fileText: text, env: io.env })
      for (const warning of resolved.warnings) log.warn(warning)
      return resolved
    })
  const core: CoreLinkFactory = deps.core ?? {
    attach: (options = {}) =>
      attachCore({
        paths,
        launch: options.launch === true,
        clientName: 'atc',
        pid,
        log: options.log ?? log,
        spawnDaemon: async () => {
          if (!deps.spawnDaemon) throw new AtcError('ATC_INTERNAL', 'this context cannot start a daemon')
          await deps.spawnDaemon(paths, options.log ?? log, options.daemonArgs ?? [])
        },
      }),
  }
  return {
    io,
    flags,
    paths,
    config: () => (config ??= loadConfig()),
    out: new Printer(io, {
      mode: flags.json ? 'json' : 'human',
      quiet: flags.quiet,
      colors,
      width: io.columns,
    }),
    log,
    prompt: createPrompter(io, { yes: flags.yes, json: flags.json }),
    colors,
    progress: createProgress(io, {
      isTTY: io.isTTY.stderr,
      quiet: flags.quiet,
      json: flags.json,
      verbose: flags.verbose,
      colors,
      width: io.columns,
    }),
    core,
    host,
    now: deps.now ?? (() => new Date()),
    signal: deps.signal ?? new AbortController().signal,
    pid,
    root: deps.root ?? { name: 'atc', summary: 'atc' },
  }
}
