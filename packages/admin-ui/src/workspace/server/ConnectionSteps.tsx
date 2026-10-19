import { Action } from '../Controls'

export function ConnectionSteps({
  model,
  online,
  hasKey,
  setup,
  start,
}: {
  model: boolean
  online: boolean
  hasKey: boolean
  setup: () => void
  start: () => Promise<unknown>
}) {
  if (model && online && hasKey)
    return <p className="ew-muted">Ready to connect. Choose your model, client key and app below.</p>
  return (
    <div className="connection-steps" aria-label="Connection checklist">
      <strong>Finish connecting</strong>
      <ol>
        <li>
          {model ? 'Model loaded' : 'Load a model'}{' '}
          {!model && <Action onClick={setup}>Set up a model</Action>}
        </li>
        <li>
          {online ? 'API online' : 'Start the API'}{' '}
          {!online && (
            <Action disabled={!model} onClick={start}>
              Start API
            </Action>
          )}
        </li>
        <li>{hasKey ? 'Client key available' : 'Create a client key in API keys below'}</li>
      </ol>
      <small>
        Downloading a model does not load it. Closing this page leaves the background server running.
      </small>
    </div>
  )
}
