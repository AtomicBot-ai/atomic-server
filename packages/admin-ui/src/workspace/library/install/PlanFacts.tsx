import { attributionOf } from '@view'
import { bytes } from '../../types'
import type { RecordValue } from '../../types'

/** What a reviewed download costs, and the notice its model's license asks for. */
export function PlanFacts({ plan, model }: { plan: RecordValue; model: RecordValue }) {
  return (
    <>
      <div className="plan-facts">
        <div>
          <span>Download</span>
          <strong>{bytes(plan.total_download_bytes ?? plan.total_bytes)}</strong>
        </div>
      </div>
      {attributionOf(model) && <p className="ew-muted">{attributionOf(model)}</p>}
    </>
  )
}
