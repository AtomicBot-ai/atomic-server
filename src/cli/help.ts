/**
 * Help rendered from the specs. The root lists commands by group; a command shows its usage line,
 * description, positionals, options, subcommands and examples, then the global options.
 */

import type { CommandGroup, CommandSpec, OptionSpec, PositionalSpec } from './command.js'
import { GROUP_TITLES, visibleOptions } from './command.js'
import { GLOBAL_OPTIONS_HELP } from './flags.js'

const INDENT = '  '

function optionLabel(name: string, option: OptionSpec): string {
  const flag = option.short ? `-${option.short}, --${name}` : `    --${name}`
  return option.type === 'string' ? `${flag} <${option.placeholder ?? 'value'}>` : flag
}

function positionalLabel(p: PositionalSpec): string {
  const base = p.rest ? `${p.name}...` : p.name
  return p.required ? `<${base}>` : `[${base}]`
}

function columns(rows: Array<[string, string]>, width: number): string {
  const label = Math.min(Math.max(...rows.map(([l]) => l.length), 0), 36)
  return rows
    .map(([l, d]) => {
      const desc = wrap(d, Math.max(width - label - INDENT.length * 2, 20))
      const [first, ...more] = desc
      const head = `${INDENT}${l.padEnd(label)}  ${first ?? ''}`
      return [head, ...more.map((line) => `${INDENT}${' '.repeat(label)}  ${line}`)].join('\n')
    })
    .join('\n')
}

function wrap(text: string, width: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}

export function usageLine(spec: CommandSpec, path: readonly string[]): string {
  const parts = ['atc', ...path]
  if (spec.subcommands) parts.push('<command>')
  for (const p of spec.positionals ?? []) parts.push(positionalLabel(p))
  if (visibleOptions(spec).length) parts.push('[options]')
  return parts.join(' ')
}

export function renderHelp(
  spec: CommandSpec,
  path: readonly string[],
  options: { width?: number } = {}
): string {
  const width = options.width ?? 80
  const out: string[] = []
  if (path.length === 0) return renderRootHelp(spec, width)
  out.push(`Usage: ${usageLine(spec, path)}`, '', spec.description ?? spec.summary)
  if (spec.positionals?.length) {
    out.push(
      '',
      'Arguments:',
      columns(
        spec.positionals.map((p) => [positionalLabel(p), p.description]),
        width
      )
    )
  }
  if (spec.subcommands?.length) {
    const visible = spec.subcommands.filter((s) => !s.hidden)
    out.push(
      '',
      'Commands:',
      columns(
        visible.map((s) => [s.name, s.summary]),
        width
      )
    )
  }
  const flags = visibleOptions(spec)
  if (flags.length) {
    out.push(
      '',
      'Options:',
      columns(
        flags.map(([name, o]) => [
          optionLabel(name, o),
          o.default !== undefined ? `${o.description} (default: ${String(o.default)})` : o.description,
        ]),
        width
      )
    )
  }
  if (spec.examples?.length) out.push('', 'Examples:', ...spec.examples.map((e) => `${INDENT}${e}`))
  out.push('', 'Global options:', columns([...GLOBAL_OPTIONS_HELP], width))
  return `${out.join('\n')}\n`
}

function renderRootHelp(root: CommandSpec, width: number): string {
  const out = [`Usage: atc <command> [options]`, '', root.description ?? root.summary]
  const groups: CommandGroup[] = ['server', 'models', 'access', 'system']
  for (const group of groups) {
    const commands = (root.subcommands ?? []).filter((s) => !s.hidden && (s.group ?? 'system') === group)
    if (!commands.length) continue
    out.push(
      '',
      `${GROUP_TITLES[group]}:`,
      columns(
        commands.map((s) => [s.name, s.summary]),
        width
      )
    )
  }
  out.push('', 'Global options:', columns([...GLOBAL_OPTIONS_HELP], width))
  out.push(
    '',
    'Run `atc <command> --help` for a command; `atc <command> <subcommand> --help` for a subcommand.'
  )
  return `${out.join('\n')}\n`
}
