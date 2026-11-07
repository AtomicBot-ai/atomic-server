import { FileInput } from '../../FileInput'
import { Action } from '../../Controls'
import { describeError } from '@/services/admin-api'
import { downloadJson } from '../../chat/chat-preferences'
import { record } from '../../types'
import type { RecordValue } from '../../types'
import { settingValuesError } from '@view'

export function EngineSettingsTransfer({
  provider,
  values,
  fields,
  onImport,
  onError,
}: {
  provider: string
  values: RecordValue
  fields: RecordValue[]
  onImport: (values: RecordValue) => void
  onError: (message: string) => void
}) {
  return (
    <details className="engine-transfer">
      <summary>Import or export settings</summary>
      <Action
        onClick={() =>
          downloadJson(`${provider}-settings.json`, {
            format: 'atomic-engine-settings-v1',
            provider,
            values: Object.fromEntries(
              Object.entries(values).filter(
                ([name]) => !/env|secret|password|token|api.?key|args|arguments/i.test(name)
              )
            ),
          })
        }
      >
        Export settings (credentials and extra arguments excluded)
      </Action>
      <FileInput
        label="Import settings for this engine"
        accept=".json"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            if (file.size > 1000000) throw new Error('Choose a file smaller than 1 MB.')
            const data = record(JSON.parse(await file.text()))
            if (data.format !== 'atomic-engine-settings-v1' || data.provider !== provider)
              throw new Error('This preset is for a different engine or format.')
            const incoming = record(data.values),
              problem = settingValuesError(incoming, fields)
            if (problem) throw new Error(problem)
            onImport(incoming)
          } catch (err) {
            onError(describeError(err))
          }
        }}
      />
    </details>
  )
}
