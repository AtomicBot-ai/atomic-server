import { useState } from 'react'
import { AudioLines, Download } from 'lucide-react'
import { Action } from '../Controls'
import { DeleteConfirmation } from '../library/DeleteConfirmation'
import { record, text } from '../types'
import type { RecordValue } from '../types'

const source = (id: unknown) => `/api/workspace/artifacts/audio/${encodeURIComponent(text(id))}`

/** The clips made so far, each with its player, its words and its model. */
export function AudioClips({
  clips,
  hasModel,
  openModels,
  remove,
}: {
  clips: RecordValue[]
  hasModel: boolean
  openModels: () => void
  remove: (id: string) => Promise<void>
}) {
  const [removing, setRemoving] = useState<RecordValue | null>(null)
  if (!clips.length)
    return (
      <section className="media-output" aria-label="Audio clips">
        <div className="media-gallery-empty">
          <AudioLines size={36} aria-hidden="true" />
          <h2>Your audio</h2>
          <p>{hasModel ? 'Enter text and select Generate.' : 'Generated clips appear here.'}</p>
          {!hasModel && <Action onClick={openModels}>Choose a model</Action>}
        </div>
      </section>
    )
  return (
    <section className="media-output audio-clips" aria-label="Audio clips">
      {clips.map((clip) => {
        const recipe = record(clip.recipe)
        const words = text(recipe.text, 'Generated clip')
        return (
          <article key={text(clip.id)}>
            <strong>{words}</strong>
            <small>
              {text(record(recipe.model).displayName, '')} · {(Number(clip.audioMs) / 1000).toFixed(1)} s
            </small>
            <audio controls preload="none" src={source(clip.id)} aria-label={words} />
            <div className="ew-actions">
              <a className="ew-button" href={source(clip.id)} download aria-label={`Save ${words}`}>
                <Download size={16} />
                Save
              </a>
              <Action danger onClick={() => setRemoving(clip)}>
                Delete
              </Action>
            </div>
          </article>
        )
      })}
      {removing && (
        <DeleteConfirmation
          title="Delete this clip?"
          name={text(record(removing.recipe).text, 'Generated clip')}
          detail="The audio file and its recipe are removed from the gallery."
          confirm="Delete clip"
          onClose={() => setRemoving(null)}
          onConfirm={() => remove(text(removing.id))}
        />
      )}
    </section>
  )
}
