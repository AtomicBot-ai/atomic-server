import type { RecordValue } from '../../types'
import { text } from '../../types'

/** Unknown capabilities remain unknown; they are not negative compatibility verdicts. */
export function RuntimeModelFacts({ metadata }: { metadata: RecordValue }) {
  const capability = (value: unknown) =>
    value === true ? 'Supported' : value === false ? 'Not supported' : 'Unknown'
  const context =
    typeof metadata.context_length === 'number' && metadata.context_length > 0
      ? `${metadata.context_length.toLocaleString('en-US')} tokens`
      : 'Unknown'
  return (
    <>
      <dl className="runtime-model-facts">
        {[
          ['Context', context],
          ['Tool use', capability(metadata.tools)],
          ['Reasoning', capability(metadata.reasoning)],
          ['Structured output', capability(metadata.structured_output)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {metadata.license ? (
        <details className="runtime-model-details">
          <summary>License</summary>
          <p>{text(metadata.license)}</p>
        </details>
      ) : null}
    </>
  )
}
