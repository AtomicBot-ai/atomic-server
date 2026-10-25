/**
 * The engine panel for LiteRT-LM (spec `litert-lm-server`, "LiteRT-LM в TUI и admin"): the active build
 * and the accelerator — `openvino` on an Intel NPU, with Prepare and its step while the server prepares,
 * nothing elsewhere; Install when the engine is absent; a Models view of conf's list and Hugging Face's
 * models — every variant for this machine with the core's verdict, Hugging Face models marked
 * unverified — and the reviewed plan of one variant before its download.
 */

import type { LiteRtAcceleratorsView, LiteRtModelPlan, LiteRtSearchResult } from '../../../contract/index.js'
import {
  engineName,
  formatSize,
  liteRtAcceleratorLines,
  liteRtVariantLabel,
  liteRtVerdictText,
} from '../../../workspace-view/index.js'
import type { EnginePanel, PanelButton, PanelLine } from './engine-panel-model.js'

export interface LiteRtPanelData {
  view: LiteRtAcceleratorsView | null
  search: LiteRtSearchResult | null
  plan: LiteRtModelPlan | null
}

export function liteRtModel(p: EnginePanel): {
  lines: PanelLine[]
  buttons: PanelButton[]
  fields?: PanelButton[]
} {
  const lines: PanelLine[] = [{ text: engineName(p.engine), tone: 'title' }]
  const buttons: PanelButton[] = []
  const say = (text: string, tone: PanelLine['tone'] = 'text') => lines.push({ text, tone })
  const add = (id: string, label: string, hint: string) => buttons.push({ id, label, hint })
  const l = p.litert
  let fields: PanelButton[] | undefined
  if (p.mode === 'models') {
    lines[0] = { text: `${engineName(p.engine)} models`, tone: 'title' }
    const search = l?.search
    if (l?.plan) {
      const plan = l.plan
      say(`${plan.name}: ${plan.variant_id} (${liteRtVariantLabel(plan)})`)
      say(
        plan.present
          ? 'The file is downloaded already.'
          : `${plan.file.path}, ${formatSize(plan.download_bytes)}`,
        'muted'
      )
      if (plan.unverified) say('A Hugging Face model: not verified by Atomic Chat.', 'warn')
      for (const b of plan.blockers) say(b, 'error')
      if (!plan.blockers.length) add('litert-download', 'Download', 'Download this variant in the server')
      add('litert-plan-back', 'Back', 'Choose another variant')
    } else {
      if (!search) say(p.busy ? 'Reading the model list…' : 'No models read yet.', 'muted')
      if (search?.huggingface_unavailable)
        say(`Hugging Face is not reachable now: ${search.huggingface_error ?? ''}`, 'warn')
      fields = (search?.models ?? []).flatMap((m) =>
        m.variants.map((v) => ({
          id: `litert-variant:${m.model_id}:${v.id}`,
          label: `${v.id === m.default_variant ? '*' : ' '} ${m.name} · ${liteRtVariantLabel(v)} · ${formatSize(v.file.size)} · ${liteRtVerdictText(v.verdict)}${m.unverified ? ' · unverified' : ''}${m.gated ? ' · gated' : ''}`,
          hint: v.id,
        }))
      )
      add('litert-models-back', 'Back', 'Return to the engine')
    }
  } else {
    const view = l?.view
    say(
      view
        ? view.installed
          ? `Installed: ${view.build ?? ''}`
          : 'Not installed'
        : p.summary || 'Not installed',
      'muted'
    )
    if (!view) say(p.busy ? 'Reading the accelerator…' : 'No answer from the core yet.', 'muted')
    else if (view.installed) for (const line of liteRtAcceleratorLines(view)) say(line)
    if (view && !view.installed)
      add('litert-install', 'Install', 'Install LiteRT-LM, then openvino where an Intel NPU wants it')
    else if (view) {
      if (view.accelerators.some((a) => !a.prepared) && !view.preparing)
        add('litert-prepare', 'Prepare accelerator', 'Download openvino in the server (about 85 MB)')
      add('litert-models', 'Find models', 'Variants for this machine with the core’s verdicts')
      if (!view.preparing)
        add('litert-update', 'Update build', 'Install the newest build, then prepare openvino where offered')
      if (p.inSetup) add('setup-path-continue', 'Choose models >', 'Go on with guided setup')
    }
    add('engine-settings', 'Settings', 'This engine’s settings in the core')
    add('engine-builds', 'Builds…', 'Install, activate or remove builds')
  }
  if (p.notice) say(p.notice, 'warn')
  if (p.error) say(p.error, 'error')
  add('engine-refresh', 'Refresh', 'Ask again')
  add('close', 'Close', 'Work goes on in the server')
  return { lines, buttons, ...(fields ? { fields } : {}) }
}
