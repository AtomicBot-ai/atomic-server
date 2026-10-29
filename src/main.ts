/**
 * The dispatcher. `bin.ts` is the only file with side effects; everything here takes an `AtcIo`
 * and deps, so a test runs a command and reads what it printed without spawning a process.
 */

import {
  createContext,
  describeError,
  errorBody,
  exitCodeFor,
  opensTui,
  parseInvocation,
  renderHelp,
  resolveCommand,
  splitGlobalFlags,
  EXIT,
  releaseCommandLease,
} from './cli/index.js'
import type { ContextDeps } from './cli/index.js'
import { ROOT } from './commands/index.js'
import type { AtcIo } from './io.js'
import { colorEnabled, colorsFor } from './output/index.js'
import { ATC_VERSION } from './version.js'
import { captureFailure } from './telemetry/index.js'
import type { CommandContext } from './cli/index.js'

export type RunCliDeps = Partial<Omit<ContextDeps, 'io' | 'flags'>>

export async function runCli(argv: readonly string[], io: AtcIo, deps: RunCliDeps = {}): Promise<number> {
  const { globals, rest, error } = splitGlobalFlags(argv)
  const colors = colorsFor(colorEnabled({ isTTY: io.isTTY.stderr, env: io.env, noColor: globals.noColor }))
  if (error) {
    io.stderr(`${colors.red('error:')} ${error}\n`)
    return EXIT.USAGE
  }
  if (globals.version) {
    io.stdout(`${ATC_VERSION}\n`)
    return EXIT.OK
  }
  const root = deps.root ?? ROOT
  // Bare `atc` on an interactive terminal opens the terminal UI; everywhere else it prints help.
  const tui =
    root.subcommands?.some((c) => c.name === 'tui') === true &&
    opensTui({ rest, globals, isTTY: io.isTTY, env: io.env })
  const resolved = resolveCommand(root, tui ? ['tui'] : rest)
  const help = renderHelp(resolved.spec, resolved.path, { width: io.columns })
  if (globals.help) {
    io.stdout(help)
    return EXIT.OK
  }
  if (!resolved.spec.run) {
    // Bare `atc` or a bare group like `atc models`: the person needs the list, but did not ask
    // for it, so this is a usage exit — unless the group had an unknown word, which is an error.
    if (resolved.args.length === 0) {
      io.stdout(help)
      return EXIT.USAGE
    }
  }
  let ctx: CommandContext | undefined
  let removeFatal: (() => void) | void = undefined
  try {
    const invocation = parseInvocation(resolved)
    if (!invocation.spec.run) {
      io.stdout(help)
      return EXIT.USAGE
    }
    const leaseName = ['atc', ...invocation.path].join(' ')
    ctx = createContext({ ...deps, io, flags: globals, root, clientName: leaseName })
    removeFatal = io.catchFatal?.(ctx.errors)
    try {
      return await invocation.spec.run(invocation, ctx)
    } finally {
      await releaseCommandLease()
    }
  } catch (e) {
    captureFailure(ctx?.errors, e, {
      component: tui || resolved.spec.name === 'tui' ? 'tui' : 'cli',
      operation: resolved.path.join('.'),
    })
    if (globals.json) io.stderr(`${JSON.stringify({ error: errorBody(e) })}\n`)
    else io.stderr(`${colors.red('error:')} ${describeError(e)}\n`)
    return exitCodeFor(e)
  } finally {
    await ctx?.errors.flush(2000)
    removeFatal?.()
  }
}
