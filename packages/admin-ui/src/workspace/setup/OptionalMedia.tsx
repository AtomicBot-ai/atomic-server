// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 5043013; adapted: live media catalog and download jobs.
import { useEffect, useState } from 'react'
import { Image, Video } from 'lucide-react'
import { Action } from '../Controls'
import { bytes, record, rows, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'
import { describeError } from '@/services/admin-api'
import { DeleteConfirmation } from '../library/DeleteConfirmation'
import { downloadRows } from '@view'
import { OptionalMediaDownload } from './OptionalMediaDownload'
import { mediaDownload } from './media-download'

export function OptionalMedia({
  workspace: w,
  select,
}: {
  workspace: Workspace
  select: (model: RecordValue, category: string) => void
}) {
  const [catalogs, setCatalogs] = useState<Record<string, RecordValue[]>>({})
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [removing, setRemoving] = useState<{ id: string; name: string; ready: boolean } | null>(null)
  const { execute } = w
  useEffect(() => {
    let live = true
    setError('')
    void Promise.allSettled(
      ['image', 'video'].map(
        async (category) => [category, rows(await execute('models.catalog', { category }))] as const
      )
    ).then((results) => {
      if (!live) return
      const failed = results.find((result) => result.status === 'rejected')
      setCatalogs(
        Object.fromEntries(
          results.map((result, i) =>
            result.status === 'fulfilled' ? result.value : [['image', 'video'][i], []]
          )
        )
      )
      if (failed?.status === 'rejected') setError(describeError(failed.reason))
    })
    return () => {
      live = false
    }
  }, [execute, revision])
  return (
    <>
      {error && (
        <p className="ew-error" role="alert">
          {error} <Action onClick={() => setRevision((v) => v + 1)}>Retry</Action>
        </p>
      )}
      <div className="first-media-grid">
        {['image', 'video'].map((category) => {
          const models = catalogs[category] ?? []
          const choice = models[0]
          const id = text(choice?.id, '')
          const job = mediaDownload([...(w.snapshot?.setups ?? []), ...(w.snapshot?.downloads ?? [])], id)
          const state = text(record(job).stage ?? record(job).state, '')
          return (
            <article key={category} className={job ? 'selected' : ''}>
              <div className={`first-media-art ${category}`} aria-hidden="true">
                {category === 'image' ? <Image size={36} /> : <Video size={36} />}
              </div>
              <h2>
                {choice
                  ? text(choice.name ?? choice.title ?? choice.id)
                  : category === 'image'
                    ? 'Image models'
                    : 'Video models'}
              </h2>
              {!catalogs[category] ? (
                <p role="status">Loading models…</p>
              ) : models.length === 0 ? (
                <p>No compatible models available.</p>
              ) : (
                <>
                  {Boolean(choice?.description ?? choice?.summary) && (
                    <p>{text(choice?.description ?? choice?.summary)}</p>
                  )}
                  {typeof choice?.size === 'number' && <small>{bytes(choice.size)} download</small>}
                  {job ? (
                    <OptionalMediaDownload
                      job={downloadRows([job], w.snapshot?.downloads ?? [], true)[0] ?? job}
                      name={text(choice?.name ?? choice?.title, id)}
                      execute={execute}
                      remove={() =>
                        setRemoving({
                          id: text(record(job).id ?? record(job).setup_id),
                          name: text(choice?.name ?? choice?.title, id),
                          ready: state === 'ready',
                        })
                      }
                    />
                  ) : (
                    <Action onClick={() => select(choice!, category)}>Add to queue</Action>
                  )}
                </>
              )}
            </article>
          )
        })}
      </div>
      {removing && (
        <DeleteConfirmation
          title={removing.ready ? 'Delete model?' : 'Remove download?'}
          name={removing.name}
          detail={
            removing.ready
              ? 'Its files will be deleted.'
              : 'The download will stop and its partial files will be deleted.'
          }
          confirm={removing.ready ? 'Delete model' : 'Remove download'}
          onClose={() => setRemoving(null)}
          onConfirm={() =>
            execute('downloads.remove', {
              id: removing.id,
              owner: 'artifacts',
              ...(removing.ready ? { installed: true } : {}),
            })
          }
        />
      )}
    </>
  )
}
