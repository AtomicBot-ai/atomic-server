// Lifted from Atomic-Chat/web-app/src/containers/server-concept/SetupHelp.tsx @ 5043013; adapted: connection help for the server's endpoint and agents.
import { Action } from '../Controls'
export function ConnectionHelp({
  onSettings,
  onModels,
  disabled = false,
}: {
  onSettings: () => void
  onModels: () => void
  disabled?: boolean
}) {
  return (
    <details>
      <summary>Where do I change server settings?</summary>
      <Action disabled={disabled} onClick={onSettings}>
        Server configuration
      </Action>
      <Action disabled={disabled} onClick={onModels}>
        Engine & model
      </Action>
    </details>
  )
}
