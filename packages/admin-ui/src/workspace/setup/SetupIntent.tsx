import { SETUP_GOALS } from '@contract'
import { Action, Field } from '../Controls'

export function SetupIntent({
  goal,
  setGoal,
  agent,
  setAgent,
  technical,
  setTechnical,
  onContinue,
  onManual,
}: {
  goal: string
  setGoal: (id: string) => void
  agent: string
  setAgent: (id: string) => void
  technical: boolean
  setTechnical: (value: boolean) => void
  onContinue: () => void
  onManual: () => Promise<void>
}) {
  const primary = SETUP_GOALS.filter((g) => ['chat', 'api', 'team'].includes(g.id))
  return (
    <div className="setup-intent">
      <p className="setup-guidance">
        Run models on this machine and connect the tools you already use. The server keeps working when you
        close this window.
      </p>
      <h2>What would you like to connect?</h2>
      <div className="intent-grid" role="group" aria-label="Connection purpose">
        {primary.map((item) => (
          <button
            key={item.id}
            className={`intent-card ${goal === item.id ? 'selected' : ''}`}
            aria-pressed={goal === item.id}
            onClick={() => setGoal(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.summary}</span>
          </button>
        ))}
      </div>
      {['chat', 'coding'].includes(goal) && (
        <Field
          label="Your agent"
          hint="After verification, we will show its launch command and connection settings."
        >
          <select value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="atomic-agent">Atomic Agent</option>
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
            <option value="opencode">OpenCode</option>
          </select>
        </Field>
      )}
      <details open={!['chat', 'api', 'team'].includes(goal)}>
        <summary>More setup options</summary>
        <Field label="Service type">
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            {SETUP_GOALS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <p className="ew-muted">
          Images, video, embeddings, and routing use the server’s local control interface. Playground is
          available later for testing.
        </p>
        <label className="intent-technical">
          <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} /> Show
          configuration and CLI commands during setup
        </label>
      </details>
      <div className="wizard-bottom">
        <Action primary onClick={onContinue}>
          Choose an engine
        </Action>
        <Action onClick={onManual}>Set up later</Action>
      </div>
      <p className="ew-muted">
        Next: choose an engine and model, review the download, then verify your endpoint. Model downloads
        start after your review.
      </p>
    </div>
  )
}
