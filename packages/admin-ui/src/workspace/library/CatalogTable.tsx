// Lifted from Atomic-Chat/web-app/src/containers/hub/LocalModelTable.tsx @ 5043013; adapted: server catalog metadata and downloads.
import { Fragment, useState, type ReactNode } from 'react'
import { ArrowUpDown, ChevronDown, ChevronRight, Heart } from 'lucide-react'
import { engineName } from '@view'
import { bytes, record, text } from '../types'
import type { RecordValue } from '../types'
import { ModelMark } from './ModelMark'
import './catalog-table.css'
import { modelId, modelFormat, modelProviders } from './catalog-models'
const columns = [
  'Model',
  'Parameters',
  'Format',
  'Context',
  'Capabilities',
  'Download size',
  'This device',
  'Engines',
]
function value(model: RecordValue, column: string): string | number | undefined {
  const s = record(model.source)
  const field = (...keys: string[]) => keys.map((k) => model[k] ?? s[k]).find((v) => v != null)
  const v =
    column === 'Model'
      ? field('title', 'name', 'id', 'model_id')
      : column === 'Parameters'
        ? field('parameters', 'params', 'parameter_count')
        : column === 'Format'
          ? modelFormat(model)
          : column === 'Context'
            ? field('context_length', 'context')
            : column === 'Capabilities'
              ? field('capabilities')
              : column === 'Download size'
                ? field('size_bytes', 'download_bytes', 'size', 'total_bytes')
                : column === 'Engines'
                  ? modelProviders(model)
                  : undefined
  return Array.isArray(v) ? v.join(', ') : typeof v === 'number' || typeof v === 'string' ? v : undefined
}
function shown(model: RecordValue, column: string) {
  const v = value(model, column)
  if (v == null) return '—'
  if (column === 'Download size' && typeof v === 'number') return bytes(v)
  if (column === 'Format') return String(v).toUpperCase()
  if (column === 'Engines') return String(v).split(', ').map(engineName).join(', ')
  return String(v)
}
export function CatalogTable({
  models,
  expanded,
  onExpand,
  liked,
  onLike,
  isInstalled,
  deviceStatus,
  detail,
}: {
  models: RecordValue[]
  expanded: string
  onExpand: (id: string) => void
  liked: string[]
  onLike: (id: string) => void
  isInstalled: (id: string) => boolean
  deviceStatus?: (model: RecordValue) => string
  detail: (model: RecordValue) => ReactNode
}) {
  const [sort, setSort] = useState<{ column: string; direction: number } | null>(null)
  const sorted = sort
    ? [...models].sort((a, b) => {
        const left = value(a, sort.column),
          right = value(b, sort.column)
        if (left == null) return right == null ? 0 : 1
        if (right == null) return -1
        return (
          (typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left).localeCompare(String(right), undefined, { numeric: true })) * sort.direction
        )
      })
    : models
  return (
    <>
      <div className="hub-model-count">
        <span>{models.length} models</span>
        {sort && <button onClick={() => setSort(null)}>Reset sorting</button>}
      </div>
      <div className="hub-table-frame">
        <table className="hub-table" aria-label="Local models">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  data-column={column}
                  aria-sort={
                    sort?.column === column ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined
                  }
                >
                  {['This device', 'Capabilities'].includes(column) ? (
                    column
                  ) : (
                    <button
                      aria-label={`Sort by ${column}`}
                      onClick={() =>
                        setSort({ column, direction: sort?.column === column ? -sort.direction : 1 })
                      }
                    >
                      {column}
                      <ArrowUpDown size={11} />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((model) => {
              const id = modelId(model),
                open = expanded === id,
                status = deviceStatus?.(model) || (isInstalled(id) ? 'Downloaded' : '')
              return (
                <Fragment key={id}>
                  <tr className={open ? 'expanded' : ''}>
                    <td data-column="Model">
                      <div className="hub-model-summary">
                        <button
                          className="hub-model-disclosure"
                          title={id}
                          aria-label={text(model.title ?? model.name, id)}
                          aria-expanded={open}
                          onClick={() => onExpand(open ? '' : id)}
                        >
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          <ModelMark model={model} />
                          <span>
                            <strong>{text(model.title ?? model.name, id)}</strong>
                            {status && (
                              <small className="hub-device-compact" data-model-status={status}>
                                {status}
                              </small>
                            )}
                          </span>
                        </button>
                        <button
                          className="hub-like"
                          aria-label={`Like ${text(model.name ?? model.title, id)}`}
                          aria-pressed={liked.includes(id)}
                          onClick={() => onLike(id)}
                        >
                          <Heart size={14} fill={liked.includes(id) ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    </td>
                    {columns.slice(1).map((column) => (
                      <td key={column} data-column={column}>
                        {column === 'This device' ? (
                          <span data-model-status={status}>{status || '—'}</span>
                        ) : (
                          shown(model, column)
                        )}
                      </td>
                    ))}
                  </tr>
                  {open && (
                    <tr className="hub-expanded">
                      <td colSpan={columns.length}>
                        <div className="hub-model-detail">{detail(model)}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
