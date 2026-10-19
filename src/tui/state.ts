/**
 * The terminal UI's state and its one reducer. Pure: the controller turns the world (the daemon,
 * the log file, the config file, doctor) into actions, keys turn presses into actions, and this
 * file decides what the screen holds.
 */

import type { CoreSnapshot } from '@atomic-chat/core/client'
import type { ConfigSource, FieldType } from '../config/index.js'
import type { DaemonRecord } from '../core-link/index.js'
import type { CheckResult } from '../doctor/index.js'

/** Tabs in order; the number keys follow it. Models and Downloads join in later iterations. */
export const TABS = ['overview', 'logs', 'config', 'doctor', 'commands'] as const
export type TabId = (typeof TABS)[number]

/** Log lines kept in memory; older ones are still in the file. */
export const MAX_LOG_LINES = 5000
const MAX_ACTIVITY = 50

export interface PendingHostStep {
  step_id: string
  instructions: string
  updated_at: number
}

export type DaemonView =
  | { kind: 'connecting' }
  | { kind: 'down'; error: string | undefined }
  | { kind: 'up'; snapshot: CoreSnapshot; record: DaemonRecord | undefined; pending: PendingHostStep[] }

export type ConfirmAction = 'stop' | 'restart'

export type Overlay =
  | { kind: 'help' }
  | { kind: 'confirm'; action: ConfirmAction }
  | { kind: 'admin-link'; url: string | undefined; error: string | undefined }

export type Level = 'info' | 'warn' | 'error'

export interface ActivityLine {
  time: number
  level: Level
  text: string
}

export interface ConfigRow {
  path: string
  type: FieldType
  /** The effective value as `config get` prints it. */
  value: string
  source: ConfigSource
  description: string
  values: readonly string[] | undefined
}

export interface LogsState {
  lines: string[]
  follow: boolean
  /** Lines hidden below the view; 0 is the end of the log. */
  scroll: number
  filter: string
  /** The filter prompt has the keyboard. */
  filtering: boolean
}

export interface ConfigState {
  rows: ConfigRow[]
  cursor: number
  /** The inline editor for a string, number or list field. */
  editing: { key: string; draft: string } | undefined
  message: { level: Level; text: string } | undefined
  warnings: string[]
}

export interface DoctorState {
  running: boolean
  results: CheckResult[] | undefined
}

export interface CommandsState {
  /** The selected command in the list. */
  cursor: number
  /** Its full help is open instead of the list. */
  open: boolean
  /** Help lines scrolled past. */
  scroll: number
}

export interface TuiState {
  tab: TabId
  overlay: Overlay | undefined
  daemon: DaemonView
  /** A long action in flight (start, stop), shown with a spinner. */
  busy: string | undefined
  activity: ActivityLine[]
  logs: LogsState
  config: ConfigState
  doctor: DoctorState
  commands: CommandsState
}

export type TuiAction =
  | { type: 'tab'; tab: TabId }
  | { type: 'tab-step'; delta: 1 | -1 }
  | { type: 'overlay'; overlay: Overlay | undefined }
  | { type: 'daemon'; daemon: DaemonView }
  | { type: 'busy'; text: string | undefined }
  | { type: 'activity'; line: ActivityLine }
  | { type: 'logs-reset'; lines: string[] }
  | { type: 'logs-append'; lines: string[] }
  /** `max`: the furthest the view can go up (lines beyond one screen), known to the key handler. */
  | { type: 'logs-scroll'; by: number; max: number }
  | { type: 'logs-scroll-to'; to: 'top' | 'bottom'; max: number }
  | { type: 'logs-follow' }
  | { type: 'logs-filter'; filter: string; filtering: boolean }
  | { type: 'config-rows'; rows: ConfigRow[]; warnings: string[] }
  | { type: 'config-move'; delta: number }
  | { type: 'config-edit'; editing: ConfigState['editing'] }
  | { type: 'config-message'; message: ConfigState['message'] }
  | { type: 'doctor-running' }
  | { type: 'doctor-results'; results: CheckResult[] }
  /** `count`: how many commands the list holds, known to the key handler. */
  | { type: 'commands-move'; by: number; count: number }
  | { type: 'commands-open'; open: boolean }
  | { type: 'commands-scroll'; by: number; max: number }

export function initialState(tab: TabId = 'overview'): TuiState {
  return {
    tab,
    overlay: undefined,
    daemon: { kind: 'connecting' },
    busy: undefined,
    activity: [],
    logs: { lines: [], follow: true, scroll: 0, filter: '', filtering: false },
    config: { rows: [], cursor: 0, editing: undefined, message: undefined, warnings: [] },
    doctor: { running: false, results: undefined },
    commands: { cursor: 0, open: false, scroll: 0 },
  }
}

/** Lines that pass the filter (a plain, case-insensitive substring). */
export function visibleLogLines(logs: Pick<LogsState, 'lines' | 'filter'>): string[] {
  if (logs.filter === '') return logs.lines
  const needle = logs.filter.toLowerCase()
  return logs.lines.filter((line) => line.toLowerCase().includes(needle))
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

function reduceLogs(logs: LogsState, action: TuiAction): LogsState {
  switch (action.type) {
    case 'logs-reset':
      return { ...logs, lines: action.lines.slice(-MAX_LOG_LINES), scroll: 0 }
    case 'logs-append': {
      const lines = [...logs.lines, ...action.lines].slice(-MAX_LOG_LINES)
      // Not following: keep the same lines in view as new ones arrive below.
      const shift = logs.follow ? 0 : visibleLogLines({ lines: action.lines, filter: logs.filter }).length
      return { ...logs, lines, scroll: logs.follow ? 0 : logs.scroll + shift }
    }
    case 'logs-scroll': {
      const scroll = clamp(logs.scroll + action.by, 0, action.max)
      return { ...logs, scroll, follow: scroll === 0 && logs.follow }
    }
    case 'logs-scroll-to':
      return action.to === 'bottom'
        ? { ...logs, scroll: 0, follow: true }
        : { ...logs, scroll: action.max, follow: false }
    case 'logs-follow':
      return logs.follow ? { ...logs, follow: false } : { ...logs, follow: true, scroll: 0 }
    case 'logs-filter':
      return { ...logs, filter: action.filter, filtering: action.filtering, scroll: 0 }
    default:
      return logs
  }
}

function reduceConfig(config: ConfigState, action: TuiAction): ConfigState {
  switch (action.type) {
    case 'config-rows':
      return {
        ...config,
        rows: action.rows,
        warnings: action.warnings,
        cursor: clamp(config.cursor, 0, Math.max(0, action.rows.length - 1)),
      }
    case 'config-move':
      return {
        ...config,
        cursor: clamp(config.cursor + action.delta, 0, Math.max(0, config.rows.length - 1)),
        message: undefined,
      }
    case 'config-edit':
      return { ...config, editing: action.editing, message: undefined }
    case 'config-message':
      return { ...config, message: action.message }
    default:
      return config
  }
}

export function reduce(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case 'tab':
      return { ...state, tab: action.tab }
    case 'tab-step': {
      const index = TABS.indexOf(state.tab)
      return { ...state, tab: TABS[(index + action.delta + TABS.length) % TABS.length] as TabId }
    }
    case 'overlay':
      return { ...state, overlay: action.overlay }
    case 'daemon':
      return { ...state, daemon: action.daemon }
    case 'busy':
      return { ...state, busy: action.text }
    case 'activity':
      return { ...state, activity: [...state.activity, action.line].slice(-MAX_ACTIVITY) }
    case 'doctor-running':
      return { ...state, doctor: { ...state.doctor, running: true } }
    case 'doctor-results':
      return { ...state, doctor: { running: false, results: action.results } }
    case 'commands-move': {
      const cursor = clamp(state.commands.cursor + action.by, 0, Math.max(0, action.count - 1))
      return { ...state, commands: { ...state.commands, cursor } }
    }
    case 'commands-open':
      return { ...state, commands: { ...state.commands, open: action.open, scroll: 0 } }
    case 'commands-scroll': {
      const scroll = clamp(state.commands.scroll + action.by, 0, action.max)
      return { ...state, commands: { ...state.commands, scroll } }
    }
    default: {
      const logs = reduceLogs(state.logs, action)
      const config = reduceConfig(state.config, action)
      return logs === state.logs && config === state.config ? state : { ...state, logs, config }
    }
  }
}
