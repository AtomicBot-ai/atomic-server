/**
 * The Commands screen's data: every visible command of the tree `atc --help` renders, in the same
 * order and groups, with whether it works yet — so the screen can never disagree with the CLI.
 */

import { GROUP_TITLES, renderHelp, walkCommands } from '../cli/index.js'
import type { CommandSpec } from '../cli/index.js'

export interface CommandRow {
  path: string[]
  spec: CommandSpec
  /** The group heading it sits under (its top-level command's group). */
  group: string
  depth: number
  /** `works`, or `group` (it only holds subcommands). */
  status: string
}

export function commandRows(root: CommandSpec): CommandRow[] {
  const hidden = new Set((root.subcommands ?? []).filter((s) => s.hidden).map((s) => s.name))
  const groupOf = new Map((root.subcommands ?? []).map((s) => [s.name, GROUP_TITLES[s.group ?? 'system']]))
  return walkCommands(root)
    .filter(({ spec, path }) => !spec.hidden && !hidden.has(path[0] as string))
    .map(({ spec, path }) => ({
      path,
      spec,
      group: groupOf.get(path[0] as string) ?? '',
      depth: path.length - 1,
      status: spec.subcommands && !spec.run ? 'group' : 'works',
    }))
}

/** `atc <path> --help`, as lines at this width. */
export function helpLines(row: CommandRow, width: number): string[] {
  return renderHelp(row.spec, row.path, { width }).replace(/\n+$/, '').split('\n')
}
