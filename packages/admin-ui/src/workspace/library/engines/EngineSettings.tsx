import { EngineOverview } from './EngineOverview'
import { EngineSettingsTransfer } from './EngineSettingsTransfer'
import './engine-settings.css'
import './engine-drawer.css'
import { useConfirmation } from '../../use-confirmation'
import { EngineReload } from './EngineReload'
import { useEngineSettingsData } from './use-engine-settings-data'
import { useEffect, useState } from 'react'
import type { GpuFacts } from '@atomic-chat/core/contracts'
import {
  changedValues,
  engineFamily,
  engineHasSettings,
  engineName,
  engineTaskNote,
  settingValuesError,
} from '@view'
import { useDialog } from '../../useDialog'
import type { Workspace } from '../../useWorkspace'
import { Action } from '../../Controls'
import { record, rows, text } from '../../types'
import type { RecordValue } from '../../types'
import { SETTING_GROUPS, commonSetting, editableSetting, settingGroup } from './engine-setting-groups'
import { EngineSettingField } from './EngineSettingField'

export function EngineSettings({
  provider,
  workspace: w,
  onClose,
  presentation = 'dialog',
}: {
  provider: string
  workspace: Workspace
  onClose: () => void
  presentation?: 'dialog' | 'drawer'
}) {
  const { values, setValues, saved, schema, revision, error, setError, loading, markSaved } =
    useEngineSettingsData(provider, w.execute, engineHasSettings(provider))
  const [query, setQuery] = useState(''),
    [group, setGroup] = useState('Common')
  const [tab, setTab] = useState<'overview' | 'settings'>('overview')
  const [formError, setFormError] = useState('')
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
    if (changedOnly && Object.keys(changes).length) return name in changes && match
    if (query) return match || name in changes
    return (
      fields.length <= 6 ||
      group === 'All' ||
      (group === 'Common'
        ? commonSetting(field) || (!common && fields.indexOf(field) < 6)
        : settingGroup(field) === group)
    )
  })
  const update = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }))
    setNotice('')
    setFormError('')
  }
  const loaded = w.snapshot?.services.filter((s) => s.provider === provider && s.kind === 'chat') ?? []
  return (
    <div className={`modal-shade${presentation === 'drawer' ? ' engine-drawer-shade' : ''}`}>
      <section
        ref={dialog}
        tabIndex={-1}
        className="ew-modal settings-dialog engine-settings-dialog"
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
        <div className="engine-tabs" role="tablist" aria-label="Engine sections">
          {(['overview', 'settings'] as const).map((name) => (
            <button
              key={name}
              id={`engine-${name}-tab`}
              role="tab"
              aria-selected={tab === name}
              aria-controls={`engine-${name}-panel`}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => setTab(name)}
              onKeyDown={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault()
                  const next =
                    event.key === 'Home'
                      ? 'overview'
                      : event.key === 'End'
                        ? 'settings'
                        : name === 'overview'
                          ? 'settings'
                          : 'overview'
                  setTab(next)
                  document.getElementById(`engine-${next}-tab`)?.focus()
                }
              }}
            >
              {name === 'overview' ? 'Overview' : 'Settings'}
              {name === 'settings' && Object.keys(changes).length > 0 && (
                <span className="engine-change-count">{Object.keys(changes).length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="engine-dialog-body settings-form">
          <div
            role="tabpanel"
            id="engine-overview-panel"
            aria-labelledby="engine-overview-tab"
            hidden={tab !== 'overview'}
          >
            <EngineOverview provider={provider} workspace={w} onClose={close} />
          </div>
          <div
            role="tabpanel"
            id="engine-settings-panel"
            aria-labelledby="engine-settings-tab"
            hidden={tab !== 'settings'}
          >
            <p className="ew-muted engine-settings-note">
              {engineTaskNote(provider) ?? 'Settings apply on the next model load.'}
            </p>
            {loading && <p role="status">Loading engine settings…</p>}
            {(formError || error) && (
              <p role="alert" className="ew-error">
                {formError || error}
              </p>
            )}
            {fields.length > 6 && (
              <input
                aria-label="Find engine setting"
                placeholder="Search all settings…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            {fields.length > 6 && (
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
            )}
            {Object.keys(changes).length > 0 && (
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
            )}
            {!visible.length && !loading && engineHasSettings(provider) && (
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
            <EngineSettingsTransfer
              provider={provider}
              values={values}
              fields={fields}
              onError={setFormError}
              onImport={(incoming) => {
                setValues({ ...values, ...incoming })
                setChangedOnly(true)
                setQuery('')
                setNotice('Imported settings are staged. Review and save to apply on the next model load.')
                setFormError('')
              }}
            />
          </div>
        </div>
        <div className="settings-footer engine-dialog-footer">
          {notice && <p role="status">{notice}</p>}
          {Object.keys(changes).length > 0 && (
            <div className="ew-actions">
              <Action
                primary
                disabled={loading || saving || waiting || !Object.keys(changes).length}
                onClick={async () => {
                  if (values.mtp && values.dflash)
                    throw new Error('Choose MTP or DFlash; they cannot be enabled together.')
                  const problem = settingValuesError(changes, fields)
                  if (problem) throw new Error(problem)
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
