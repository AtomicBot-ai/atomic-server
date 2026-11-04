import { Action } from '../Controls'
import { text } from '../types'
import type { RecordValue } from '../types'
import { useDialog } from '../useDialog'

/** A viewport-sized dialog keeps recipe actions outside the clipped preview area. */
export function MediaRecipe({
  recipe,
  restore,
  onClose,
}: {
  recipe: RecordValue
  restore: (recipe: RecordValue) => void
  onClose: () => void
}) {
  const ref = useDialog(onClose)
  return (
    <div className="modal-shade">
      <section
        ref={ref}
        className="ew-modal media-recipe-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Recipe"
        tabIndex={-1}
      >
        <div className="panel-heading">
          <h2>Recipe</h2>
          <Action ariaLabel="Close recipe" onClick={onClose}>
            ×
          </Action>
        </div>
        <p>{text(recipe.prompt, 'No prompt recorded.')}</p>
        <Action
          onClick={() => {
            restore(recipe)
            onClose()
          }}
        >
          Restore settings
        </Action>
      </section>
    </div>
  )
}
