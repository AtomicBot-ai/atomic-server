import {
  engineName,
  changedValues,
  formFields,
  fieldText,
  fieldValue,
} from '../../../workspace-view/index.js'
import { engineSettingOptions } from './engine-setting-options.js'
import type { EnginePanel, PanelLine, PanelButton } from './engine-panel-model.js'
/** The settings form: one field a row, Save sends only what changed. */
export function settingsModel(p: EnginePanel) {
  const lines: PanelLine[] = [
    { text: `${engineName(p.engine)} settings`, tone: 'title' },
    { text: 'Changes apply from the next model load.', tone: 'muted' },
  ]
  const f = p.form
  const changed = f ? changedValues(f.values, f.draft, f.descriptors) : {}
  if (!f) lines.push({ text: p.busy ? 'Reading the settings…' : 'No settings read yet.', tone: 'muted' })
  const fields: PanelButton[] = f
    ? formFields(f.descriptors).flatMap((d) => {
        const options = engineSettingOptions(p, d)
        const field = {
          id: `engine-setting:${d.key}`,
          label: `${d.title}: ${fieldText(d, fieldValue(d, f.values, f.draft), f.gpus)}${options.length ? ' v' : ''}${d.key in changed ? '  *' : ''}`,
          hint: d.description.split('. ')[0] ?? d.key,
        }
        return [
          field,
          ...(p.choice === d.key
            ? options.map((option, index) => ({
                id: `engine-option:${index}`,
                label: `  ${option.value === fieldValue(d, f.values, f.draft) ? '(o)' : '( )'} ${option.label}`,
                hint: option.label,
              }))
            : []),
        ]
      })
    : []
  if (p.notice) lines.push({ text: p.notice, tone: 'warn' })
  if (p.error) lines.push({ text: p.error, tone: 'error' })
  const buttons: PanelButton[] = [
    ...(Object.keys(changed).length
      ? [{ id: 'engine-settings-save', label: 'Save changes', hint: 'Save the changed settings in the core' }]
      : []),
    { id: 'engine-settings-back', label: 'Back', hint: 'Return to the engine' },
    { id: 'close', label: 'Close', hint: 'Discard unsaved changes' },
  ]
  return { lines, buttons, fields }
}
