import type { Workspace } from '../useWorkspace'
import { Action, Empty, Panel } from '../Controls'
import { text } from '../types'

export function Activity({ workspace: w }: { workspace: Workspace }) {
  const s = w.snapshot
  return (
    <Panel
      title="Recent requests"
      actions={
        <Action onClick={() => w.execute('api.inspector', { enabled: !s?.metrics.detailed })}>
          {s?.metrics.detailed ? 'Disable detailed metrics' : 'Enable detailed metrics'}
        </Action>
      }
    >
      <p className="ew-muted">
        Detailed metrics enable Core's request inspector. Core temporarily captures prompt and response
        previews; this page retains timing and token counts only.
      </p>
      {s?.requests.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Model</th>
                <th>Route</th>
                <th>Status</th>
                <th>Duration</th>
                <th>First token</th>
                <th>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {s.requests.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.finished_at).toLocaleTimeString()}</td>
                  <td>{row.model}</td>
                  <td>{row.endpoint}</td>
                  <td>{text(row.status)}</td>
                  <td>{text(row.duration_ms)} ms</td>
                  <td>{text(row.ttft_ms)} ms</td>
                  <td>
                    {row.tokens_estimated ? '≈ ' : ''}
                    {text(row.completion_tokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No requests received in this session.</Empty>
      )}
    </Panel>
  )
}
