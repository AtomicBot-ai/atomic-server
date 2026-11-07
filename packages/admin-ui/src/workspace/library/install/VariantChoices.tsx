import { engineVariantStatus, formatSize } from '@view'
import './variant-choices.css'

interface Choice {
  id: string
  label: string
  size: number | null
  verdict: { verdict: string; reason: string | null }
}
/** Device names remain short; availability and the selected reason have their own space. */
export function VariantChoices({
  name,
  choices,
  value,
  disabled,
  onChange,
}: {
  name: string
  choices: Choice[]
  value: string
  disabled: boolean
  onChange: (id: string) => void
}) {
  const selected = choices.find((choice) => choice.id === value)
  return (
    <>
      <fieldset className="variant-choices" disabled={disabled}>
        <legend>Run on</legend>
        {choices.map((choice) => (
          <label key={choice.id} className={`variant-choice ${value === choice.id ? 'selected' : ''}`}>
            <input
              type="radio"
              name={name}
              checked={value === choice.id}
              onChange={() => onChange(choice.id)}
            />
            <span>
              <strong>{choice.label}</strong>
              <small>{engineVariantStatus(choice.verdict.verdict)}</small>
            </span>
            <span className="variant-size">{choice.size ? formatSize(choice.size) : 'Size unknown'}</span>
          </label>
        ))}
      </fieldset>
      {selected && selected.verdict.verdict !== 'ok' && (
        <div className="variant-explanation" role="status">
          <strong>{engineVariantStatus(selected.verdict.verdict)}</strong>
          {selected.verdict.reason && <p>{selected.verdict.reason}</p>}
        </div>
      )}
    </>
  )
}
