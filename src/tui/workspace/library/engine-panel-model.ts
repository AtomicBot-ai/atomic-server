/**
 * The managed engine panel of Library → Engines (design D16), as data: the lines and buttons for one
 * engine, from the core's state (`engines.plan`) joined with the live snapshot (8.1) — the snapshot's
 * operation, installation and host steps win, since it is 2.5 s old at most. Same words as
 * `atc engines install|rm|status`: they come from `workspace-view`. Approve carries the digest of the
 * plan these lines show, and none while the operation waits for consent to a plan not shown.
 */

import type { EnvironmentOperation, GpuFacts, SettingDescriptor } from '@atomic-chat/core/contracts'
import type { ManagedEngineState, ServerLaunch, WorkspaceSnapshot } from '../../../contract/index.js'
import {
  engineName,
  engineView,
  fieldText,
  fieldValue,
  formFields,
  formatSize,
  operationView,
  planBlocked,
  planLines,
  rebootLines,
  reloginLines,
  removalLines,
} from '../../../workspace-view/index.js'

/** The settings form of the open panel: the core's schema and values, and the person's edits. */
export interface EngineForm {
  descriptors: SettingDescriptor[]
  values: Record<string, unknown>
  /** The revision read when the form opened; a save sends it. */
  revision: number | undefined
  draft: Record<string, unknown>
  /** The environment's cards, for `gpu_id` of a managed engine. */
  gpus: GpuFacts[]
}

export interface EnginePanel {
  engine: string
  /** A managed engine (plan, operations) or an engine of builds (llama.cpp, MLX, Foundry Local). */
  kind: 'managed' | 'build'
  /** For an engine of builds: its active build as Library lists it. */
  summary: string
  mode: 'engine' | 'settings'
  form: EngineForm | null
  /** `engines.plan`'s answer; `null` until it came. */
  state: ManagedEngineState | null
  busy: boolean
  error: string
  notice: string
  /** The removal plan is shown and waits for a confirmation. */
  removing: boolean
  keepModels: boolean
  launch: ServerLaunch
  /** The live operation key the state was last read for (`panelRefreshKey`). */
  seen: string
}

export interface PanelLine {
  text: string
  tone: 'title' | 'text' | 'muted' | 'warn' | 'error' | 'command'
}
export interface PanelButton {
  id: string
  label: string
  hint: string
  /** Approve: the plan digest of the plan the lines show. */
  digest?: string
}

const engineOf = (op: EnvironmentOperation) => (op.target.kind === 'runtime' ? op.target.engine_id : '')

/** The core's state with what the snapshot knows newer: this engine's operation and installation. */
function merged(p: EnginePanel, live: WorkspaceSnapshot | null): ManagedEngineState {
  const state = p.state!
  if (!live?.engines) return state
  const mine = live.engines.find((e) => e.engine === p.engine)
  const other = live.engines.find((e) => e.engine !== p.engine && e.operation)?.operation ?? null
  return {
    ...state,
    operation: mine?.operation ?? null,
    installation: mine?.installation ?? null,
    other_operation: other,
  }
}

/** This engine's operation as the panel shows it: the snapshot's, else the one the core last named. */
export const panelOperation = (p: EnginePanel, live: WorkspaceSnapshot | null) =>
  p.state ? merged(p, live).operation : null

/** Changes whenever the live operation of this engine starts, moves to another phase or ends. */
export function panelRefreshKey(p: EnginePanel, live: WorkspaceSnapshot | null): string {
  const op = live?.engines?.find((e) => e.engine === p.engine)?.operation
  return op ? `${op.operation_id}:${op.phase}:${op.plan_digest ?? ''}` : 'none'
}

export function enginePanelModel(
  p: EnginePanel,
  live: WorkspaceSnapshot | null
): { lines: PanelLine[]; buttons: PanelButton[]; fields?: PanelButton[] } {
  if (p.mode === 'settings') return settingsModel(p)
  const lines: PanelLine[] = [{ text: engineName(p.engine), tone: 'title' }]
  const buttons: PanelButton[] = []
  const say = (text: string, tone: PanelLine['tone'] = 'text') => lines.push({ text, tone })
  const add = (id: string, label: string, hint: string, digest?: string) =>
    buttons.push({ id, label, hint, ...(digest ? { digest } : {}) })
  const end = () => {
    if (p.notice) say(p.notice, 'warn')
    if (p.error) say(p.error, 'error')
    add('engine-refresh', 'Refresh', 'Ask the core again')
    add('close', 'Close', 'The operation goes on in the server')
    return { lines, buttons }
  }
  if (p.kind === 'build') {
    say(p.summary || 'Not installed', 'muted')
    add('engine-settings', 'Settings', 'This engine’s settings in the core')
    add('engine-builds', 'Builds…', 'Install, activate or remove builds')
    return end()
  }
  if (!p.state) {
    say(p.busy ? 'Reading the core’s plan…' : 'The core gave no answer yet.', 'muted')
    return end()
  }
  const state = merged(p, live)
  const view = engineView(state)
  say(view.summary, 'muted')
  const op = view.operation
  switch (view.kind) {
    case 'checking':
    case 'unsupported':
    case 'blocked':
      for (const line of state.plan ? planLines(state) : []) say(line)
      break
    case 'installable': {
      for (const line of planLines(state)) say(line)
      const other = state.other_operation
      if (other)
        say(
          `The ${other.kind} of ${engineOf(other)} runs first: the core changes one managed engine at a time; ${p.engine} is next.`,
          'warn'
        )
      else if (state.plan && !planBlocked(state.plan))
        add('engine-approve', 'Approve and install', 'Agree to exactly this plan', state.plan.plan_digest)
      break
    }
    case 'consent':
      if (op!.kind === 'remove') {
        for (const line of removalLines(state)) say(line)
        add('engine-approve', 'Approve removal', 'Agree to this removal', op!.plan_digest ?? undefined)
      } else if (op!.plan_digest && state.plan?.plan_digest === op!.plan_digest) {
        for (const line of planLines(state)) say(line)
        add('engine-approve', 'Approve', 'Agree to exactly this plan', op!.plan_digest)
      } else say('The plan changed since it was read: reading the new one to ask again…', 'warn')
      add('engine-cancel', 'Cancel', 'Stop at the core’s next safe boundary')
      break
    case 'operation': {
      const v = operationView(op!)
      say(v.text)
      if (v.total) say(`${formatSize(v.done)} of ${formatSize(v.total)}`, 'muted')
      add('engine-cancel', 'Cancel', 'Stop at the core’s next safe boundary')
      break
    }
    case 'host-step': {
      say(operationView(op!).text)
      const step = live?.host_steps?.find((h) => h.operation_id === op!.operation_id)
      if (step?.instructions) {
        say('Run this as administrator; the panel moves on by itself once it ran:', 'warn')
        say(step.instructions, 'command')
      } else say('The server runs the privileged step; it asks for a password where it can.', 'muted')
      add('engine-cancel', 'Cancel', 'Stop at the core’s next safe boundary')
      break
    }
    case 'relogin':
      for (const line of reloginLines(p.launch, op!.operation_id)) say(line)
      add('engine-resume', 'Continue', 'Continue once the server has the new group')
      break
    case 'reboot':
      for (const line of rebootLines(op!.operation_id)) say(line)
      add('engine-resume', 'Continue', 'Continue after the restart')
      break
    case 'failed':
      say(op!.error?.message ?? 'The setup failed.', 'error')
      add('engine-resume', 'Retry', 'Continue the failed setup')
      break
    case 'ready':
    case 'update':
      if (p.removing) {
        for (const line of removalLines(state, p.keepModels)) say(line)
        add('engine-keep-models', `Keep models: ${p.keepModels ? 'on' : 'off'}`, 'Keep the shared models')
        add('engine-remove-confirm', 'Remove', 'Remove this engine now')
        add('engine-remove-cancel', 'Back', 'Keep the engine')
        break
      }
      if (view.kind === 'update')
        add('engine-update', 'Update', 'Reinstall with the newer release, keeping models')
      add('engine-remove', 'Remove…', 'Show what removing it does')
      add('engine-settings', 'Settings', 'This engine’s settings in the core')
      break
  }
  return end()
}

/** The settings form: one field a row, Save sends only what changed. */
function settingsModel(p: EnginePanel) {
  const lines: PanelLine[] = [
    { text: `${engineName(p.engine)} settings`, tone: 'title' },
    { text: 'Changes apply from the next model load.', tone: 'muted' },
  ]
  const f = p.form
  if (!f) lines.push({ text: p.busy ? 'Reading the settings…' : 'No settings read yet.', tone: 'muted' })
  const fields: PanelButton[] = f
    ? formFields(f.descriptors).map((d) => ({
        id: `engine-setting:${d.key}`,
        label: `${d.title}: ${fieldText(d, fieldValue(d, f.values, f.draft), f.gpus)}${d.key in f.draft ? '  •' : ''}`,
        hint: d.description.split('. ')[0] ?? d.key,
      }))
    : []
  if (p.notice) lines.push({ text: p.notice, tone: 'warn' })
  if (p.error) lines.push({ text: p.error, tone: 'error' })
  const buttons: PanelButton[] = [
    { id: 'engine-settings-save', label: 'Save', hint: 'Save the changed settings in the core' },
    { id: 'engine-settings-back', label: 'Back', hint: 'Return to the engine' },
    { id: 'close', label: 'Close', hint: 'Discard unsaved changes' },
  ]
  return { lines, buttons, fields }
}
