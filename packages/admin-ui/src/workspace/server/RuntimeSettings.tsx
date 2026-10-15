import { useEffect, useState } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action, Field, Panel } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'

export function RuntimeSettings({ workspace: w, onSaved }: { workspace: Workspace; onSaved?: () => void }) {
  const [config, setConfig] = useState<RecordValue>({})
  const [fields, setFields] = useState<RecordValue[]>([])
  const [changes, setChanges] = useState<RecordValue>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [group, setGroup] = useState('api')
  const { execute } = w
  useEffect(() => {
    let active = true
    void execute('config.get')
      .then((result) => {
        if (active) {
          const value = record(result)
          setConfig(record(value.values))
          setFields(rows(value.fields))
        }
      })
      .catch((e) => {
        if (active) setError(describeError(e))
      })
    return () => {
      active = false
    }
  }, [execute])
  const value = (path: string) =>
    changes[path] ?? path.split('.').reduce<unknown>((current, part) => record(current)[part], config)
  const update = (path: string, next: unknown) => {
    setChanges((current) => ({ ...current, [path]: next }))
    setNotice('')
  }
  const choices = [...new Set(fields.map((field) => text(field.path).split('.')[0]))]
  return (
    <Panel title="Server configuration">
      <div className="ew-actions">
        <Field label="Section">
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {choices.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </Field>
      </div>
      {error && (
        <p className="ew-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="form-grid">
        {fields
          .filter((field) => text(field.path).startsWith(`${group}.`) && field.path !== 'api.cors')
          .map((field) => {
            const path = text(field.path),
              current = value(path),
              options = Array.isArray(field.values) ? field.values : []
            return (
              <Field
                key={path}
                label={path.replace(`${group}.`, '')}
                hint={`${text(field.description, '')}${field.source && field.source !== 'default' ? ` · Source: ${text(field.source)}` : ''}`}
              >
                {options.length ? (
                  <select value={text(current, '')} onChange={(e) => update(path, e.target.value)}>
                    {options.map((option) => (
                      <option key={text(option)}>{text(option)}</option>
                    ))}
                  </select>
                ) : typeof current === 'boolean' ? (
                  <select value={String(current)} onChange={(e) => update(path, e.target.value === 'true')}>
                    <option value="true">On</option>
                    <option value="false">Off</option>
                  </select>
                ) : (
                  <input
                    type={
                      typeof current === 'number'
                        ? 'number'
                        : /token|password/.test(path)
                          ? 'password'
                          : 'text'
                    }
                    value={Array.isArray(current) ? current.join(', ') : text(current, '')}
                    onChange={(e) =>
                      update(
                        path,
                        Array.isArray(current)
                          ? e.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean)
                          : typeof current === 'number'
                            ? Number(e.target.value)
                            : e.target.value
                      )
                    }
                  />
                )}
              </Field>
            )
          })}
      </div>
      <div className="ew-actions">
        <Action
          primary
          disabled={!Object.keys(changes).length}
          onClick={async () => {
            const result = record(await execute('config.update', { values: changes }))
            setNotice(
              result.restart_required
                ? 'Saved. Restart the server process to apply these settings.'
                : 'Saved.'
            )
            setChanges({})
            const next = record(await execute('config.get'))
            setConfig(record(next.values))
            onSaved?.()
          }}
        >
          Save configuration
        </Action>
        {group === 'api' && (
          <Action
            onClick={async () => {
              if (
                w.snapshot?.api.running &&
                !window.confirm('Apply API listener settings? Active requests will be interrupted.')
              )
                return
              await execute(w.snapshot?.api.running ? 'api.restart' : 'api.start', {
                request: {
                  host: value('api.host'),
                  port: value('api.port'),
                  prefix: value('api.prefix'),
                  trusted_hosts: value('api.trustedHosts'),
                },
              })
              setNotice('Listener settings applied. Save configuration to use them on future starts.')
            }}
          >
            Apply to API now
          </Action>
        )}
      </div>
    </Panel>
  )
}
