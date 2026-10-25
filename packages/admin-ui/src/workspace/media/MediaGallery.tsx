// Lifted from atomic-chat-ui/web-app/src/containers/images/ImageGenerationPage.tsx and ImageViewer.tsx @ 807b4d9; adapted: authenticated artifact URLs and supported gallery actions.
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Expand, Image, Video } from 'lucide-react'
import { Action } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import { useDialog } from '../useDialog'

export function MediaGallery({
  task,
  gallery,
  job,
  pending,
  refresh,
  restore,
  openModels,
  hasModel,
}: {
  task: string
  gallery: RecordValue[]
  job: RecordValue | null
  pending: boolean
  refresh: () => Promise<void>
  restore: (recipe: RecordValue) => void
  openModels: () => void
  hasModel: boolean
}) {
  const [selected, setSelected] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const index = Math.max(
    0,
    gallery.findIndex((item) => item.id === selected)
  )
  const item = gallery[index]
  const Icon = task === 'video' ? Video : Image
  const src = (id: unknown) => `/api/workspace/artifacts/${task}/${encodeURIComponent(text(id))}`
  const step = (direction: number) => {
    if (gallery.length) setSelected(text(gallery[(index + direction + gallery.length) % gallery.length].id))
  }
  const progress = record(job?.progress)
  return (
    <section
      className="media-output"
      aria-label={task === 'video' ? 'Video viewer and gallery' : 'Image viewer and gallery'}
    >
      <div
        className="media-viewer"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            step(e.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
      >
        {pending ? (
          <div className="media-generating" role="status">
            <Icon size={36} aria-hidden="true" />
            <strong>{task === 'video' ? 'Generating video…' : 'Generating image…'}</strong>
            <progress aria-label="Generation progress" max={1} value={Number(progress.fraction ?? 0)} />
            <span>
              {text(progress.step, '0')} / {text(progress.totalSteps, '?')} steps
              {progress.etaSeconds != null ? ` · ${Math.ceil(Number(progress.etaSeconds))}s remaining` : ''}
            </span>
          </div>
        ) : item ? (
          <>
            <div className="media-preview">
              {task === 'image' ? (
                <button aria-label="Open image preview" onClick={() => setFullscreen(true)}>
                  <img src={src(item.id)} alt={text(record(item.recipe).prompt, 'Generated image')} />
                </button>
              ) : (
                <video src={src(item.id)} controls preload="metadata" />
              )}
            </div>
            <div className="media-viewer-toolbar">
              <Action ariaLabel="Previous result" disabled={gallery.length < 2} onClick={() => step(-1)}>
                <ChevronLeft size={16} />
              </Action>
              <span>
                {index + 1} / {gallery.length}
              </span>
              <Action ariaLabel="Next result" disabled={gallery.length < 2} onClick={() => step(1)}>
                <ChevronRight size={16} />
              </Action>
              <details className="media-recipe">
                <summary>Recipe</summary>
                <div>
                  <p>{text(record(item.recipe).prompt, 'No prompt recorded.')}</p>
                  <Action onClick={() => restore(record(item.recipe))}>Restore settings</Action>
                </div>
              </details>
              {task === 'image' && (
                <Action ariaLabel="Full-screen preview" onClick={() => setFullscreen(true)}>
                  <Expand size={16} />
                </Action>
              )}
              <a className="ew-button" href={src(item.id)} download aria-label="Save result">
                <Download size={16} />
                Save
              </a>
            </div>
          </>
        ) : (
          <div className="media-gallery-empty">
            <Icon size={36} aria-hidden="true" />
            <h2>{task === 'video' ? 'Your videos' : 'Your images'}</h2>
            <p>
              {hasModel
                ? 'Enter a prompt and select Generate.'
                : `Generated ${task === 'video' ? 'videos' : 'images'} appear here.`}
            </p>
            {!hasModel && <Action onClick={openModels}>Choose a model</Action>}
          </div>
        )}
        {job?.error ? (
          <p role="alert" className="ew-error">
            {text(record(job.error).message ?? job.error)}
          </p>
        ) : null}
      </div>
      {(gallery.length > 0 || pending) && (
        <section className="media-gallery" aria-label="Gallery">
          <header>
            <Icon size={15} />
            <strong>Gallery</strong>
            <span>{gallery.length + (pending ? 1 : 0)}</span>
            <Action onClick={refresh}>Refresh</Action>
          </header>
          <div className="media-gallery-grid">
            {gallery.map((entry) => (
              <button
                key={text(entry.id)}
                aria-label={`View ${text(record(entry.recipe).prompt, text(entry.id))}`}
                aria-pressed={!pending && item?.id === entry.id}
                onClick={() => setSelected(text(entry.id))}
              >
                {task === 'image' ? (
                  <img
                    src={src(entry.id)}
                    alt={text(record(entry.recipe).prompt, 'Generated image')}
                    loading="lazy"
                  />
                ) : (
                  <video src={src(entry.id)} preload="metadata" />
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      {fullscreen && item && (
        <MediaPreview
          src={src(item.id)}
          prompt={text(record(item.recipe).prompt, 'Generated image')}
          onClose={() => setFullscreen(false)}
        />
      )}
    </section>
  )
}
function MediaPreview({ src, prompt, onClose }: { src: string; prompt: string; onClose: () => void }) {
  const ref = useDialog(onClose)
  return (
    <div className="modal-shade">
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Image preview"
        tabIndex={-1}
        className="media-fullscreen"
      >
        <Action ariaLabel="Close image preview" onClick={onClose}>
          ×
        </Action>
        <img src={src} alt={prompt} />
      </section>
    </div>
  )
}
