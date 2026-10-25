// Lifted from Atomic-Chat/web-app/src/containers/ChatInput.tsx @ 807b4d9; adapted: server model choices.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, Star } from 'lucide-react'
import type { WorkspaceServiceRow } from '@contract'
import { useDialog } from '../useDialog'
import type { ChatPreferences } from './chat-preferences'
import { InstalledLoad } from './InstalledLoad'
const favoriteKey = (model: WorkspaceServiceRow) => `${model.provider}/${model.model}`
function modelLabel(model: string, raw: boolean) {
  return raw ? model : model.split('/').pop()?.replace(/[-_]/g, ' ') || model
}
interface Props {
  models: WorkspaceServiceRow[]
  selected: string
  setSelected: (v: string) => void
  preferences: ChatPreferences
  save: (v: ChatPreferences) => void
  disabled: boolean
  onCatalog: () => void
  openRequest?: number
}
export function ChatModelPicker(props: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (props.openRequest) setOpen(true)
  }, [props.openRequest])
  const current = props.models.find((m) => m.id === props.selected)
  return (
    <div className="chat-model-picker">
      <button
        ref={trigger}
        type="button"
        className="chat-model-trigger"
        aria-label="Choose chat model"
        title={current?.model}
        disabled={props.disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span>{current ? modelLabel(current.model, props.preferences.rawNames) : 'Choose a model'}</span>
        <ChevronDown size={14} />
      </button>
      {open && <ModelMenu {...props} anchor={trigger.current} onClose={() => setOpen(false)} />}
    </div>
  )
}
function ModelMenu({
  models,
  selected,
  setSelected,
  preferences,
  save,
  disabled,
  onCatalog,
  onClose,
  anchor,
}: Props & { onClose: () => void; anchor: HTMLButtonElement | null }) {
  const [query, setQuery] = useState('')
  const dialog = useDialog(onClose)
  const [position, setPosition] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    const update = () => {
      const bounds = anchor?.getBoundingClientRect()
      if (!bounds) return
      const width = Math.min(350, window.innerWidth - 32)
      const above = bounds.top - 24,
        below = window.innerHeight - bounds.bottom - 24
      const upwards = above >= below
      setPosition({
        position: 'fixed',
        width,
        maxWidth: width,
        left: Math.max(16, Math.min(bounds.right - width, window.innerWidth - width - 16)),
        top: upwards ? 'auto' : bounds.bottom + 12,
        bottom: upwards ? window.innerHeight - bounds.top + 12 : 'auto',
        maxHeight: Math.max(96, Math.min(480, upwards ? above : below)),
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchor])
  const sorted = [...models]
    .filter((m) => `${m.provider} ${m.model}`.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) =>
        Number(preferences.favorites.includes(favoriteKey(b))) -
        Number(preferences.favorites.includes(favoriteKey(a)))
    )
  return createPortal(
    <div className="modal-shade chat-model-shade">
      <section
        ref={dialog}
        className="chat-model-menu"
        style={position}
        role="dialog"
        aria-modal="true"
        aria-label="Chat model"
        tabIndex={-1}
      >
        <div className="chat-model-search">
          <Search size={16} />
          <input
            aria-label="Search ready models"
            placeholder="Search models"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="chat-model-options">
          {sorted.map((m) => (
            <div className="chat-model-option" key={m.id}>
              <button
                type="button"
                disabled={disabled || !['ready', 'loaded', 'running'].includes(m.state)}
                aria-pressed={m.id === selected}
                onClick={() => {
                  setSelected(m.id)
                  onClose()
                }}
              >
                <span>
                  <strong>{modelLabel(m.model, preferences.rawNames)}</strong>
                  <small>
                    {m.provider} · {m.state}
                  </small>
                </span>
                {m.id === selected && <Check size={16} />}
              </button>
              <button
                className="chat-model-favorite"
                type="button"
                disabled={disabled}
                aria-label={`${preferences.favorites.includes(favoriteKey(m)) ? 'Remove' : 'Add'} favorite ${m.model}`}
                onClick={() =>
                  save({
                    ...preferences,
                    favorites: preferences.favorites.includes(favoriteKey(m))
                      ? preferences.favorites.filter((id) => id !== favoriteKey(m))
                      : [...preferences.favorites, favoriteKey(m)],
                  })
                }
              >
                <Star
                  size={14}
                  fill={preferences.favorites.includes(favoriteKey(m)) ? 'currentColor' : 'none'}
                />
              </button>
            </div>
          ))}
          {!sorted.length && <p>{query ? 'No matching models.' : 'No loaded models.'}</p>}
        </div>
        <InstalledLoad disabled={disabled} />
        <button
          type="button"
          className="chat-model-manage"
          onClick={() => {
            onClose()
            onCatalog()
          }}
        >
          Manage models
        </button>
      </section>
    </div>,
    anchor?.closest('.chat-enhanced') ?? anchor?.closest('.eye-workspace') ?? document.body
  )
}
