import { JsonResult } from '../Controls'
import type { RecordValue } from '../types'
export function ChatCapabilities({ usage, capabilities }: { usage: RecordValue; capabilities: RecordValue }) {
  return (
    <details>
      <summary>Context & capabilities</summary>
      <p>
        Prompt tokens in last response:{' '}
        {usage.prompt_tokens === undefined ? 'not reported' : String(usage.prompt_tokens)}. Trained context
        ceiling: {capabilities.maxCtxTrain ? String(capabilities.maxCtxTrain) : 'not reported'}.
      </p>
      <small>
        The loaded context may be smaller than the trained ceiling. No token counts are estimated.
      </small>
      <JsonResult value={capabilities} />
    </details>
  )
}
