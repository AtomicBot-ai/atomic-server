import { EngineBuilds } from './EngineBuilds'
import { EngineSetup } from './EngineSetup'
import { FoundryLocal } from './FoundryLocal'
import { useConfirmation } from '../use-confirmation'
import { EngineReload } from './EngineReload'
import { useEngineSettingsData } from './use-engine-settings-data'
import { useEffect, useState } from 'react'
import type { GpuFacts } from '@atomic-chat/core/contracts'
import { changedValues, engineFamily, engineName } from '@view'
import { useDialog } from '../useDialog'
import type { Workspace } from '../useWorkspace'
import { Action, Field } from '../Controls'
import { describeError } from '@/services/admin-api'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { SETTING_GROUPS, commonSetting, editableSetting, settingGroup } from './engine-setting-groups'
import { EngineSettingField } from './EngineSettingField'
import { downloadJson } from '../chat/chat-preferences'

export function EngineSettings({
  provider,
  workspace: w,
  onClose,
}: {
  provider: string
  workspace: Workspace
  onClose: () => void
}) {
  const { values, setValues, saved, schema, revision, error, setError, loading, markSaved } =
    useEngineSettingsData(provider, w.execute, provider !== 'sd-cpp')
  const [query, setQuery] = useState(''),
    [group, setGroup] = useState('All')
  const [notice, setNotice] = useState(''),
    [changedOnly, setChangedOnly] = useState(false)
  const { ask, confirmation, waiting } = useConfirmation()
  const [saving, setSaving] = useState(false)
  const changes = changedValues(saved, values, schema)
  const close = () => {
    if (saving || waiting) return
    if (!Object.keys(changes).length) onClose()
    else
      ask({
        title: 'Discard unsaved engine settings?',
        actionLabel: 'Discard changes',
        danger: true,
        children: <p>Your changes have not been saved.</p>,
        onConfirm: async () => onClose(),
      })
  }
  const dialog = useDialog(close),
    { execute } = w
  const [gpus, setGpus] = useState<GpuFacts[]>([])
  useEffect(() => {
    if (engineFamily(provider) !== 'managed') return
    void execute('environments.list').then(
      (list) => setGpus((rows(list)[0]?.gpus as GpuFacts[]) ?? []),
      () => {}
    )
  }, [provider, execute])
  const fields: RecordValue[] = (
    schema.length
      ? schema
      : Object.entries(saved).map(([key, value]) => ({
          key,
          title: key.replaceAll('_', ' '),
          controllerType: typeof value === 'boolean' ? 'checkbox' : 'input',
          controllerProps: { value, type: typeof value === 'number' ? 'number' : 'text' },
        }))
  ).filter(editableSetting)
  const common = fields.some(commonSetting)
  const visible = fields.filter((field) => {
    const name = text(field.key),
      match = `${field.title} ${name} ${field.description}`.toLowerCase().includes(query.toLowerCase())
    if (changedOnly) return name in changes && match
    if (query) return match || name in changes
    return (
      group === 'All' ||
      (group === 'Common'
        ? commonSetting(field) || (!common && fields.indexOf(field) < 6)
        : settingGroup(field) === group)
    )
  })
  const update = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }))
    setNotice('')
  }
  const loaded = w.snapshot?.services.filter((s) => s.provider === provider && s.kind === 'chat') ?? []
  return (
    <div className="modal-shade">
      <section
        ref={dialog}
        tabIndex={-1}
        className="ew-modal settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${provider} settings`}
      >
        <div className="panel-heading">
          <h2>{engineName(provider)}</h2>
          <button className="ew-button" disabled={saving} onClick={close}>
            Close
          </button>
        </div>
        <EngineBuilds provider={provider} execute={execute} />
        {engineFamily(provider) === 'managed' && (
          <EngineSetup workspace={w} engine={provider} onClose={onClose} embedded />
        )}
        {provider === 'foundry-local' && <FoundryLocal workspace={w} onClose={onClose} embedded />}
        <p className="ew-muted">
          {provider === 'sd-cpp'
            ? 'Generation settings are saved with image and video tasks.'
            : 'Settings apply on the next model load.'}
        </p>
        {loading && <p role="status">Loading engine settings…</p>}
        {error && (
          <p role="alert" className="ew-error">
            {error}
          </p>
        )}
        <input
          aria-label="Find engine setting"
          placeholder="Search all settings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav className="subnav setting-groups" aria-label="Engine setting groups">
          {SETTING_GROUPS.filter(
            (name) => ['Common', 'All'].includes(name) || fields.some((f) => settingGroup(f) === name)
          ).map((name) => (
            <button
              key={name}
              className={group === name ? 'active' : ''}
              onClick={() => {
                setGroup(name)
                setQuery('')
                setChangedOnly(false)
              }}
            >
              {name}
            </button>
          ))}
        </nav>
        <label className="preference-check">
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(e) => {
              setChangedOnly(e.target.checked)
              setQuery('')
            }}
          />
          Review changes ({Object.keys(changes).length})
        </label>
        {!visible.length && !loading && provider !== 'sd-cpp' && (
          <p className="ew-muted">No settings match. Search another term or choose All.</p>
        )}
        <div className="form-grid">
          {visible.map((field) => (
            <EngineSettingField
              key={text(field.key)}
              field={field}
              values={values}
              saved={saved}
              update={update}
              gpus={gpus}
              managed={engineFamily(provider) === 'managed'}
            />
          ))}
        </div>
        <details>
          <summary>Import / export engine configuration</summary>
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
          <Field label="Import settings for this engine">
            <input
              type="file"
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
                    known = new Set(fields.map((f) => text(f.key)))
                  if (Object.keys(incoming).some((key) => !known.has(key)))
                    throw new Error('This preset has settings unsupported by this engine build.')
                  setValues({ ...values, ...incoming })
                  setChangedOnly(true)
                  setQuery('')
                  setNotice('Imported settings are staged. Review and save to apply on the next model load.')
                  setError('')
                } catch (err) {
                  setError(describeError(err))
                }
              }}
            />
          </Field>
        </details>
        <div className="settings-footer">
          {notice && <p role="status">{notice}</p>}
          {Object.keys(changes).length > 0 && (
            <div className="ew-actions">
              <Action
                primary
                disabled={loading || saving || waiting || !Object.keys(changes).length}
                onClick={async () => {
                  if (values.mtp && values.dflash)
                    throw new Error('Choose MTP or DFlash; they cannot be enabled together.')
                  for (const field of fields) {
                    const key = text(field.key),
                      props = record(field.controllerProps),
                      value = changes[key]
                    if (
                      key in changes &&
                      props.type === 'number' &&
                      (typeof value !== 'number' ||
                        !Number.isFinite(value) ||
                        (typeof props.min === 'number' && value < props.min) ||
                        (typeof props.max === 'number' && value > props.max))
                    )
                      throw new Error(`Enter a valid number for ${text(field.title, key)}.`)
                  }
                  setSaving(true)
                  try {
                    const result = record(
                      await execute('settings.update', {
                        provider,
                        values: changes,
                        ...(revision !== undefined ? { expected_revision: revision } : {}),
                      })
                    )
                    markSaved(values, Number(result.revision ?? revision))
                    setError('')
                    setNotice('Saved. Running models keep their current settings until reloaded.')
                    dialog.current?.querySelector<HTMLButtonElement>('.panel-heading button')?.focus()
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                Save changes
              </Action>
              <Action
                disabled={saving || waiting || !Object.keys(changes).length}
                onClick={() => {
                  setValues({ ...saved })
                  setNotice('Unsaved changes discarded.')
                  dialog.current?.querySelector<HTMLButtonElement>('.panel-heading button')?.focus()
                }}
              >
                Discard changes
              </Action>
            </div>
          )}
          <EngineReload
            provider={provider}
            models={loaded}
            execute={execute}
            disabled={saving || waiting || Object.keys(changes).length > 0}
            onNotice={setNotice}
          />
        </div>
      </section>
      {confirmation}
    </div>
  )
}
