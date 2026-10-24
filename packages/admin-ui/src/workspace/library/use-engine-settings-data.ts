import { useEffect, useRef, useState } from 'react'
import { changedValues } from '@view'
import { describeError } from '@/services/admin-api'
import type { Workspace } from '../useWorkspace'
import { watchSharedRead } from '../watch-shared-read'
import { record, rows } from '../types'
import type { RecordValue } from '../types'

/** Refresh saved engine settings while retaining local edits and their conflict revision. */
export function useEngineSettingsData(provider: string, execute: Workspace['execute'], enabled = true) {
  const [values, setValues] = useState<RecordValue>({}),
    [saved, setSaved] = useState<RecordValue>({})
  const [schema, setSchema] = useState<RecordValue[]>([]),
    [revision, setRevision] = useState<number>()
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(enabled)
  const previous = useRef<RecordValue>({}),
    previousSchema = useRef<RecordValue[]>([]),
    dirty = useRef(false)
  dirty.current = Object.keys(changedValues(saved, values, schema)).length > 0
  useEffect(
    () =>
      enabled
        ? watchSharedRead(
            () =>
              Promise.all([execute('settings.get', { provider }), execute('settings.schema', { provider })]),
            ([settings, descriptors]) => {
              const data = record(settings),
                next = record(data.values),
                before = previous.current,
                beforeSchema = previousSchema.current
              previous.current = next
              previousSchema.current = rows(descriptors)
              setValues((current) => ({
                ...next,
                ...changedValues(before, current, beforeSchema),
              }))
              setSaved(next)
              if (!dirty.current) setRevision(Number(data.revision))
              setSchema(rows(descriptors))
              setLoading(false)
              setError('')
            },
            (e) => {
              setError(describeError(e))
              setLoading(false)
            }
          )
        : undefined,
    [provider, execute, enabled]
  )
  const markSaved = (next: RecordValue, nextRevision: number) => {
    previous.current = { ...next }
    setSaved({ ...next })
    setRevision(nextRevision)
  }
  return { values, setValues, saved, schema, revision, error, setError, loading, markSaved }
}
