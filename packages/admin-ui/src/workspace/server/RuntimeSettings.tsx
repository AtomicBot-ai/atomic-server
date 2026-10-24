// Lifted from Atomic-Chat/web-app/src/containers/Card.tsx and routes/settings/general.tsx @ 5043013; adapted: schema-backed settings, isolated section drafts and explicit saves.
import { watchSharedRead } from '../watch-shared-read'
import { useEffect, useState } from 'react'
import { SETTINGS_SECTIONS, SERVER_SETTINGS_GROUPS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action, Field } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'
import { RuntimeSettingRow } from './RuntimeSettingRow'
import { runtimeSettingError } from './runtime-setting-error'

const getValue = (config: RecordValue, path: string) =>
  path.split('.').reduce<unknown>((value, part) => record(value)[part], config)
export function RuntimeSettings({
  workspace: w,
  onSaved,
  section,
}: {
  workspace: Workspace
  onSaved?: () => void
  section?: string
}) {
  const [config, setConfig] = useState<RecordValue>({})
  const [fields, setFields] = useState<RecordValue[]>([])
  const [draft, setDraft] = useState<RecordValue>({})
  const [arrayText, setArrayText] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeGroup, setNoticeGroup] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [localGroup, setGroup] = useState('api')
  const group = section ?? localGroup
  const { execute } = w
  useEffect(() => {
    setLoading(true)
    setError('')
    return watchSharedRead(
      () => execute('config.get'),
      (result) => {
        const value = record(result)
        setConfig(record(value.values))
        setFields(rows(value.fields))
        setLoading(false)
        setError('')
      },
      (e) => {
        setError(describeError(e))
        setLoading(false)
      }
    )
  }, [execute, revision])
  const visible = fields.filter(
    (field) =>
      text(field.path).startsWith(`${group}.`) && !['api.cors', 'tui.mode'].includes(text(field.path))
  )
  const value = (path: string) => draft[path] ?? getValue(config, path)
  const changes = Object.fromEntries(
    visible
      .map((field) => {
        const path = text(field.path),
          current = value(path)
        return [
          path,
          current !== '' && (field.type === 'number' || typeof getValue(config, path) === 'number')
            ? Number(current)
            : current,
        ]
      })
      .filter(([path, current]) => JSON.stringify(current) !== JSON.stringify(getValue(config, String(path))))
  )
  const dirty = Object.keys(changes).length > 0
  const valid = visible.every((field) => !runtimeSettingError(field, value(text(field.path))))
  const clear = () => {
    const keep = ([path]: [string, unknown]) => !path.startsWith(`${group}.`)
    setDraft((current) => Object.fromEntries(Object.entries(current).filter(keep)))
    setArrayText((current) => Object.fromEntries(Object.entries(current).filter(keep)))
    setNotice('')
  }
  const control = (field: RecordValue) => (
    <RuntimeSettingRow
      key={text(field.path)}
      field={field}
      value={value(text(field.path))}
      arrayText={arrayText[text(field.path)]}
      disabled={saving}
      update={(next, raw) => {
        setDraft((current) => ({ ...current, [text(field.path)]: next }))
        if (raw !== undefined) setArrayText((current) => ({ ...current, [text(field.path)]: raw }))
        setNotice('')
      }}
    />
  )
  const advanced =
    group === 'admin' ? ['admin.host', 'admin.port'] : group === 'tui' ? ['tui.endpoint', 'tui.model'] : []
  return (
    <section
      className="runtime-settings server-settings"
      aria-label={`${[...SETTINGS_SECTIONS, ...SERVER_SETTINGS_GROUPS].find((item) => item.id === group)?.label ?? group} settings`}
    >
      {!section && (
        <Field label="Section">
          <select
            disabled={saving}
            value={group}
            onChange={(e) => {
              setGroup(e.target.value)
              setNotice('')
            }}
          >
            {[...new Set(fields.map((field) => text(field.path).split('.')[0]))].map((name) => (
              <option key={name} value={name}>
                {[...SETTINGS_SECTIONS, ...SERVER_SETTINGS_GROUPS].find((item) => item.id === name)?.label ??
                  name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {loading && <p role="status">Loading settings…</p>}
      {error && (
        <div className="ew-error" role="alert">
          {error}
          <Action onClick={() => setRevision((n) => n + 1)}>Retry</Action>
        </div>
      )}
      {!loading && !error && (
        <>
          <div className="settings-card">
            {visible.filter((field) => !advanced.includes(text(field.path))).map(control)}
            {!visible.length && <p>No settings available.</p>}
          </div>
          {visible.some((field) => advanced.includes(text(field.path))) && (
            <details className="settings-card settings-advanced">
              <summary>Advanced settings</summary>
              {visible.filter((field) => advanced.includes(text(field.path))).map(control)}
            </details>
          )}
          {dirty && (
            <div className="server-save-bar">
              <span role="status">Unsaved changes</span>
              <Action disabled={saving} onClick={clear}>
                Discard
              </Action>
              <Action
                primary
                disabled={saving || !valid}
                onClick={async () => {
                  setSaving(true)
                  try {
                    const result = record(await execute('config.update', { values: changes }))
                    if (group === 'api' && w.snapshot?.api.running) await execute('api.restart')
                    const next = record(await execute('config.get'))
                    setConfig(record(next.values))
                    clear()
                    setNoticeGroup(group)
                    setNotice(
                      result.restart_required
                        ? 'Saved. Restart the server to apply changes.'
                        : 'Changes saved.'
                    )
                    onSaved?.()
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                Save changes
              </Action>
            </div>
          )}
          {notice && noticeGroup === group && <p role="status">{notice}</p>}
        </>
      )}
    </section>
  )
}
