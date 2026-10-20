/**
 * The engine panel for Foundry Local (spec `foundry-local-server`): the library's accelerators with
 * Prepare and each accelerator's step while the server prepares; Install when the engine is absent; a
 * Models view of conf's list and Microsoft's catalog — every variant for this machine with the core's
 * verdict, catalog models marked unverified — and the reviewed plan of one variant before its download.
 */

import type { FoundryAcceleratorsView, FoundryModelPlan } from '../../../contract/index.js'
import type { FoundrySearchResult } from '../../../workspace-service/index.js'
import {
  acceleratorLines,
  engineName,
  formatSize,
  foundryVerdictText,
  variantLabel,
} from '../../../workspace-view/index.js'
import type { EnginePanel, PanelButton, PanelLine } from './engine-panel-model.js'

export interface FoundryPanelData {
  view: FoundryAcceleratorsView | null
  search: FoundrySearchResult | null
  plan: FoundryModelPlan | null
}

const preparable = (v: FoundryAcceleratorsView) =>
  v.accelerators.some((a) => !a.prepared && a.execution_provider !== null)

export function foundryModel(p: EnginePanel): {
  lines: PanelLine[]
  buttons: PanelButton[]
  fields?: PanelButton[]
} {
  const lines: PanelLine[] = [{ text: engineName(p.engine), tone: 'title' }]
  const buttons: PanelButton[] = []
  const say = (text: string, tone: PanelLine['tone'] = 'text') => lines.push({ text, tone })
  const add = (id: string, label: string, hint: string) => buttons.push({ id, label, hint })
  const f = p.foundry
  let fields: PanelButton[] | undefined
  if (p.mode === 'models') {
    lines[0] = { text: `${engineName(p.engine)} models`, tone: 'title' }
    const search = f?.search
    if (f?.plan) {
      const plan = f.plan
      say(`${plan.name}: ${plan.variant_id} (${variantLabel(plan)})`)
      say(
        `${plan.pending.length} of ${plan.files.length} files to download, ${formatSize(plan.download_bytes)}`,
        'muted'
      )
      if (plan.unverified) say('A Microsoft catalog model: unverified by Atomic Chat (sizes only).', 'warn')
      for (const b of plan.blockers) say(b, 'error')
      if (!plan.blockers.length) add('foundry-download', 'Download', 'Download this variant in the server')
      add('foundry-plan-back', 'Back', 'Choose another variant')
    } else {
      if (!search) say(p.busy ? 'Reading the model list…' : 'No models read yet.', 'muted')
      if (search?.catalog_unavailable)
        say(`Microsoft’s catalog could not be read: ${search.catalog_error ?? ''}`, 'warn')
      fields = (search?.models ?? []).flatMap((m) =>
        m.variants.map((v) => ({
          id: `foundry-variant:${m.model_id}:${v.id}`,
          label: `${v.id === m.default_variant ? '*' : ' '} ${m.name} · ${variantLabel(v)} · ${v.size_bytes ? formatSize(v.size_bytes) : '?'} · ${foundryVerdictText(v.verdict)}${m.unverified ? ' · unverified' : ''}`,
          hint: v.id,
        }))
      )
      add('foundry-models-back', 'Back', 'Return to the accelerators')
    }
  } else {
    say(p.summary || 'Not installed', 'muted')
    const view = f?.view
    if (!view) say(p.busy ? 'Reading the accelerators…' : 'No answer from the library yet.', 'muted')
    for (const line of view ? acceleratorLines(view) : []) say(line)
    if (view && !view.installed)
      add('foundry-install', 'Install', 'Install Foundry Local, then prepare its accelerators')
    else if (view) {
      if (preparable(view) && !view.preparing)
        add(
          'foundry-prepare',
          'Prepare accelerators',
          'Download and register them in the server (about 2 GB)'
        )
      add('foundry-models', 'Find models', 'Variants for this machine with the core’s verdicts')
      if (!view.preparing)
        add('foundry-update', 'Update build', 'Install the newest build, then prepare its accelerators')
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
