// Lifted from Atomic-Chat/web-app/src/containers/hub/MediaHub.tsx + MediaFamilyRow.tsx @ 5043013; adapted: live server artifacts.
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { text } from '../types'
import type { RecordValue } from '../types'
import { ModelMark } from './ModelMark'
import { modelId } from './catalog-models'
export function CatalogMedia({
  models,
  expanded,
  onExpand,
  isInstalled,
  deviceStatus,
  detail,
}: {
  models: RecordValue[]
  expanded: string
  onExpand: (id: string) => void
  isInstalled: (id: string) => boolean
  deviceStatus?: (model: RecordValue) => string
  detail: (model: RecordValue) => ReactNode
}) {
  return (
    <div className="hub-media-list">
      {[true, false].map((installed) => {
        const entries = models.filter((m) => isInstalled(modelId(m)) === installed)
        return entries.length ? (
          <section key={String(installed)}>
            <h2>{installed ? 'Installed' : 'Available'}</h2>
            {entries.map((model) => {
              const id = modelId(model),
                open = id === expanded,
                status = deviceStatus?.(model) || (installed ? 'Downloaded' : '')
              return (
                <article className="hub-media-family" key={id}>
                  <button
                    className="hub-model-disclosure"
                    aria-label={text(model.title ?? model.name, id)}
                    aria-expanded={open}
                    onClick={() => onExpand(open ? '' : id)}
                  >
                    <ModelMark model={model} />
                    <span>
                      <strong>{text(model.title ?? model.name, id)}</strong>
                      <small>{text(model.description ?? model.summary, '')}</small>
                      {status && <small data-model-status={status}>{status}</small>}
                    </span>
                    <span className="hub-model-chevron">
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                  </button>
                  {open && <div className="hub-model-detail">{detail(model)}</div>}
                </article>
              )
            })}
          </section>
        ) : null
      })}
    </div>
  )
}
