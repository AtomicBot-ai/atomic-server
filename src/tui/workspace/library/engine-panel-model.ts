/**
 * The managed engine panel of Library → Engines (design D16), as data: the lines and buttons for one
 * engine, from the core's state (`engines.plan`) joined with the live snapshot (8.1) — the snapshot's
 * operation, installation and host steps win, since it is 2.5 s old at most. Same words as
 * `atc engines install|rm|status`: they come from `workspace-view`. Approve carries the digest of the
 * plan these lines show, and none while the operation waits for consent to a plan not shown.
 */

import type { GpuFacts, SettingDescriptor } from '@atomic-chat/core/contracts'
import type { ManagedEngineState, ServerLaunch, WorkspaceSnapshot } from '../../../contract/index.js'
import {
  engineApproval,
  engineName,
  engineRefreshKey,
  engineView,
  liveEngineState,
  updateLine,
  fieldText,
  fieldValue,
  formFields,
  formatSize,
  operationView,
  planLines,
  rebootLines,
  failureLines,
  otherOperationLine,
  planBlocked,
  reloginLines,
  removalLines,
} from '../../../workspace-view/index.js'
import { foundryModel } from './foundry-panel-model.js'
import type { FoundryPanelData } from './foundry-panel-model.js'
import { liteRtModel } from './litert-panel-model.js'
import type { LiteRtPanelData } from './litert-panel-model.js'

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
  /** A managed engine (plan, operations), Foundry Local or LiteRT-LM (accelerators, variants), or an engine of builds. */
  kind: 'managed' | 'foundry' | 'litert' | 'build'
  /** For an engine of builds: its active build as Library lists it. */
  summary: string
  mode: 'engine' | 'settings' | 'models'
  form: EngineForm | null
  /** Foundry Local's accelerators, model list and reviewed plan. */
  foundry: FoundryPanelData | null
  /** LiteRT-LM's accelerator, model list and reviewed plan. */
  litert?: LiteRtPanelData | null
  /** Opened by guided setup: once the engine is ready it offers to go on to the models. */
  inSetup?: boolean
  /** An update the core offers, shown for consent before its reinstall removes the installed image. */
  offer?: { from: string; target: string; state: ManagedEngineState } | null
  /** `engines.plan`'s answer; `null` until it came. */
  state: ManagedEngineState | null
  busy: boolean
  error: string
  notice: string
  /** The removal plan is shown and waits for a confirmation. */
  removing: boolean
  keepModels: boolean
  launch: ServerLaunch
  /** The systemd unit the server runs as, for the sign-in steps. */
  service?: string
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

/** This engine's operation as the panel shows it: the snapshot's, else the one the core last named. */
export const panelOperation = (p: EnginePanel, live: WorkspaceSnapshot | null) =>
  p.state ? liveEngineState(p.state, live).operation : null

/** Changes whenever the live operation of this engine starts, moves to another phase or ends. */
export function panelRefreshKey(p: EnginePanel, live: WorkspaceSnapshot | null): string {
  // Foundry Local: again at every snapshot while a prepare runs; an engine of builds: never.
  if (p.kind === 'foundry') return p.foundry?.view?.preparing ? `prepare:${live?.captured_at ?? 0}` : p.seen
  if (p.kind === 'litert') return p.litert?.view?.preparing ? `prepare:${live?.captured_at ?? 0}` : p.seen
  if (p.kind === 'build') return p.seen
  return engineRefreshKey(p.engine, live)
}

export function enginePanelModel(
  p: EnginePanel,
  live: WorkspaceSnapshot | null
): { lines: PanelLine[]; buttons: PanelButton[]; fields?: PanelButton[] } {
  if (p.mode === 'settings') return settingsModel(p)
  if (p.kind === 'foundry') return foundryModel(p)
  if (p.kind === 'litert') return liteRtModel(p)
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
  const state = liveEngineState(p.state, live)
  const approval = engineApproval(state)
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
      if (other) say(otherOperationLine(other, p.engine), 'warn')
      else if (approval)
        add('engine-approve', 'Approve and install', 'Agree to exactly this plan', approval.digest)
      break
    }
    case 'consent':
      if (op!.kind === 'remove') {
        for (const line of removalLines(state)) say(line)
        if (approval) add('engine-approve', 'Approve removal', 'Agree to this removal', approval.digest)
      } else if (approval) {
        for (const line of planLines(state)) say(line)
        add('engine-approve', 'Approve', 'Agree to exactly this plan', approval.digest)
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
      for (const line of reloginLines(p.launch, op!.operation_id, p.service)) say(line)
      add('engine-resume', 'Continue', 'Continue once the server has the new group')
      break
    case 'reboot':
      for (const line of rebootLines(op!.operation_id)) say(line)
      add('engine-resume', 'Continue', 'Continue after the restart')
      break
    case 'failed': {
      for (const line of failureLines(op!)) say(line, 'error')
      // The core changes one managed engine at a time: a Retry now would only wait behind it.
      const other = state.other_operation
      if (other) say(otherOperationLine(other, p.engine), 'warn')
      else add('engine-resume', 'Retry', 'Continue the failed setup')
      break
    }
    case 'ready':
    case 'update':
      if (p.offer) {
        say(updateLine(p.engine, p.offer.from, p.offer.target), 'warn')
        for (const line of planLines(p.offer.state)) say(line)
        const offered = p.offer.state.plan
        // A release this machine cannot run is never agreed to: the reinstall removes the working image first.
        const digest = offered && !planBlocked(offered) ? offered.plan_digest : null
        if (digest) add('engine-update-confirm', 'Agree and update', 'Agree to exactly this plan', digest)
        add('engine-update-cancel', 'Back', 'Keep the installed release')
        break
      }
      if (p.removing) {
        for (const line of removalLines(state, p.keepModels)) say(line)
        add('engine-keep-models', `Keep models: ${p.keepModels ? 'on' : 'off'}`, 'Keep the shared models')
        add('engine-remove-confirm', 'Remove', 'Remove this engine now')
        add('engine-remove-cancel', 'Back', 'Keep the engine')
        break
      }
      if (p.inSetup) add('setup-path-continue', 'Choose models >', 'Go on with guided setup')
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
