// Lifted from Atomic-Chat/web-app/src/containers/hub/MediaHub.tsx + MediaFamilyRow.tsx @ 5043013; adapted: live server artifacts and compact accessible model cards.
import { useId, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { text } from '../../types'
import type { RecordValue } from '../../types'
import { attributionOf, engineName } from '@view'
import { ModelMark } from './ModelMark'
import { catalogDownloadOptions } from './catalog-download-options'
import './catalog-media.css'
import { modelId, modelProviders } from './catalog-models'
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
  const panelId = useId()
  return (
    <div className="hub-media-list">
      {[true, false].map((installed) => {
        const entries = models.filter((m) => isInstalled(modelId(m)) === installed)
        return entries.length ? (
          <section key={String(installed)}>
            <div className="hub-media-heading">
              <h2>{installed ? 'Installed' : 'Available'}</h2>
              <span>{entries.length} models</span>
            </div>
            {entries.map((model, index) => {
              const id = modelId(model),
                open = id === expanded,
                detailsId = `${panelId}-${installed}-${index}`,
                count = catalogDownloadOptions(model).length,
                status = deviceStatus?.(model) || (installed ? 'Downloaded' : '')
              return (
                <article className="hub-media-family" data-expanded={open} key={id}>
                  <button
                    className="hub-model-disclosure"
                    aria-label={text(model.title ?? model.name, id)}
                    id={`${detailsId}-trigger`}
                    aria-controls={open ? detailsId : undefined}
                    aria-expanded={open}
                    onClick={() => onExpand(open ? '' : id)}
                  >
                    <ModelMark model={model} />
                    <span className="hub-media-copy">
                      <strong>{text(model.title ?? model.name, id)}</strong>
                      <small className="hub-media-description">
                        {text(model.description ?? model.summary, '')}
                      </small>
                      {attributionOf(model) && <small>{attributionOf(model)}</small>}
                      <span className="hub-media-meta">
                        {modelProviders(model).map((provider) => (
                          <span key={provider}>{engineName(provider)}</span>
                        ))}
                        <span>
                          {count} {count === 1 ? 'variant' : 'variants'}
                        </span>
                        {status && <span data-model-status={status}>{status}</span>}
                      </span>
                    </span>
                    <span className="hub-model-chevron">
                      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                  </button>
                  {open && (
                    <div
                      id={detailsId}
                      role="region"
                      aria-labelledby={`${detailsId}-trigger`}
                      className="hub-model-detail"
                    >
                      {detail(model)}
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        ) : null
      })}
    </div>
  )
}
