/**
 * The command framework: a spec per command (options, positionals, subcommands, `run`), resolved
 * and parsed with `node:util` `parseArgs`. Help and the generated docs render from the same specs,
 * so nothing can drift between what a command accepts and what it says it accepts.
 */

import { parseArgs } from 'node:util'
import type { CommandContext } from './context.js'
import { AtcError } from '../errors/index.js'
import { plannedFor } from './not-implemented.js'

export type OptionType = 'string' | 'boolean'

export interface OptionSpec {
  type: OptionType
  short?: string
  multiple?: boolean
  description: string
  /** Shown in help as `--flag <placeholder>`; defaults to `value`. */
  placeholder?: string
  default?: string | boolean
}

export interface PositionalSpec {
  name: string
  description: string
  required?: boolean
  /** Collects every remaining positional. */
  rest?: boolean
}

export type CommandGroup = 'server' | 'models' | 'access' | 'system'

export const GROUP_TITLES: Record<CommandGroup, string> = {
  server: 'Server',
  models: 'Models & engines',
  access: 'Access',
  system: 'System',
}

export type OptionValue = string | boolean | string[] | undefined

export interface Invocation {
  /** Command path without the program name, e.g. `['models', 'pull']`. */
  path: string[]
  values: Record<string, OptionValue>
  positionals: string[]
  spec: CommandSpec
}

export type CommandRun = (invocation: Invocation, ctx: CommandContext) => Promise<number>

export interface CommandSpec {
  name: string
  summary: string
  description?: string
  group?: CommandGroup
  hidden?: boolean
  options?: Record<string, OptionSpec>
  positionals?: PositionalSpec[]
  subcommands?: CommandSpec[]
  /** Run this subcommand when none is named (e.g. `atc admin` → `atc admin open`). */
  defaultSubcommand?: string
  examples?: string[]
  /** Set by `notImplemented()`: the command exists in the tree but has no implementation yet. */
  stub?: true
  /** Absent: the command only holds subcommands and prints help when invoked bare. */
  run?: CommandRun
}

export function defineCommand(spec: CommandSpec): CommandSpec {
  return spec
}

/** A stub: strict flag parsing and help as designed, then a clear "not yet" with the planned iteration. */
export function notImplemented(spec: Omit<CommandSpec, 'run' | 'stub'>): CommandSpec {
  return {
    ...spec,
    stub: true,
    run: async (invocation) => {
      const command = `atc ${invocation.path.join(' ')}`
      throw new AtcError('ATC_NOT_IMPLEMENTED', `\`${command}\` is not implemented yet.`, {
        details: `planned for ${plannedFor(invocation.path) ?? 'a later iteration'}`,
        hint: 'this build is the scaffold; see docs/commands.md for what works today',
      })
    },
  }
}

export interface ResolvedCommand {
  spec: CommandSpec
  path: string[]
  /** What is left for the command's own parser. */
  args: string[]
}

/** Walk the subcommand tree as far as the leading words go. */
export function resolveCommand(root: CommandSpec, args: readonly string[]): ResolvedCommand {
  let spec = root
  const path: string[] = []
  let index = 0
  while (spec.subcommands && index < args.length) {
    const word = args[index] as string
    const next = spec.subcommands.find((s) => s.name === word)
    if (!next) break
    spec = next
    path.push(word)
    index += 1
  }
  if (
    spec.subcommands &&
    spec.defaultSubcommand &&
    (index >= args.length || (args[index] as string).startsWith('-'))
  ) {
    const next = spec.subcommands.find((s) => s.name === spec.defaultSubcommand)
    if (next) {
      spec = next
      path.push(next.name)
    }
  }
  return { spec, path, args: args.slice(index) }
}

/** Parse a resolved command's own flags and positionals; every mistake is `ATC_USAGE`. */
export function parseInvocation(resolved: ResolvedCommand): Invocation {
  const { spec, path, args } = resolved
  const options: Record<
    string,
    { type: OptionType; short?: string; multiple?: boolean; default?: string | boolean | string[] }
  > = {}
  for (const [name, option] of Object.entries(spec.options ?? {})) {
    options[name] = {
      type: option.type,
      ...(option.short ? { short: option.short } : {}),
      ...(option.multiple ? { multiple: true } : {}),
      ...(option.default !== undefined
        ? { default: option.multiple ? [String(option.default)] : option.default }
        : {}),
    }
  }
  let parsed: { values: Record<string, OptionValue>; positionals: string[] }
  try {
    parsed = parseArgs({
      args,
      options,
      strict: true,
      allowPositionals: true,
      allowNegative: true,
    }) as typeof parsed
  } catch (error) {
    throw new AtcError('ATC_USAGE', (error as Error).message, {
      hint: helpHint(path),
    })
  }
  // `allowNegative` reads `--no-accelerators` as `accelerators: false`; an option spelled `no-<x>` with
  // no `<x>` of its own gets its value back under its own name.
  for (const name of Object.keys(options)) {
    const base = name.slice(3)
    if (name.startsWith('no-') && !(base in options) && parsed.values[base] === false) {
      delete parsed.values[base]
      parsed.values[name] = true
    }
  }
  const specs = spec.positionals ?? []
  const required = specs.filter((p) => p.required).length
  const hasRest = specs.some((p) => p.rest)
  if (parsed.positionals.length < required) {
    const missing = specs[parsed.positionals.length]?.name ?? 'argument'
    throw new AtcError('ATC_USAGE', `Missing <${missing}>.`, { hint: helpHint(path) })
  }
  if (!hasRest && parsed.positionals.length > specs.length) {
    const extra = parsed.positionals.slice(specs.length).join(' ')
    throw new AtcError('ATC_USAGE', `Unexpected argument: ${extra}`, {
      hint: specs.length === 0 && spec.subcommands ? `unknown subcommand; ${helpHint(path)}` : helpHint(path),
    })
  }
  return { path, values: parsed.values, positionals: parsed.positionals, spec }
}

function helpHint(path: readonly string[]): string {
  return `see \`${['atc', ...path, '--help'].join(' ')}\``
}

/** Every command in the tree with its path, in definition order (help, docs, completion, tests). */
export function walkCommands(
  root: CommandSpec,
  path: string[] = []
): Array<{ spec: CommandSpec; path: string[] }> {
  const out: Array<{ spec: CommandSpec; path: string[] }> = []
  for (const sub of root.subcommands ?? []) {
    const subPath = [...path, sub.name]
    out.push({ spec: sub, path: subPath })
    out.push(...walkCommands(sub, subPath))
  }
  return out
}
