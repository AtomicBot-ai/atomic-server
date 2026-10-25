// Lifted from Atomic-Chat/web-app/src/containers/server-concept/Setup.tsx @ 5043013; adapted: the real connection preparation steps and current API restart warning.
export function ConnectionReviewSummary({
  agent,
  endpoint,
  running,
}: {
  agent?: string
  endpoint: string
  running: boolean
}) {
  return (
    <aside className="server-review-summary">
      <strong>What happens next</strong>
      <ol>
        <li>Load the selected model</li>
        <li>Start and test your local server</li>
        <li>{agent ? `Prepare ${agent} connection` : 'Create your API endpoint'}</li>
      </ol>
      <code>{endpoint}</code>
      <small>Local access · API key required</small>
      {running && <p>Applying this connection restarts the API and interrupts active requests.</p>}
    </aside>
  )
}
