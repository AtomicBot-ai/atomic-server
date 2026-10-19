import { useEffect, useState } from 'react'
import { SERVER_SECTIONS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action, Copy, Empty, Field, JsonResult, Panel } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import { SetupDetails } from '../setup/SetupDetails'
import { RuntimeSettings } from './RuntimeSettings'
import { ServerKeys } from './ServerKeys'
import { ConnectionSteps } from './ConnectionSteps'

export function Server({
  workspace: w,
  openCommand,
  openSetup,
}: {
  workspace: Workspace
  openCommand: (name: string) => void
  openSetup: () => void
}) {
  const s = w.snapshot
  const [model, setModel] = useState('')
  const [keyId, setKeyId] = useState('')
  const [agent, setAgent] = useState('atomic-agent')
  const [profile, setProfile] = useState<RecordValue | null>(null)
  const [view, setView] = useState('connect')
  const [snippet, setSnippet] = useState('curl')
  const chatModels =
    s?.services.filter((row) => row.kind === 'chat' && ['ready', 'running', 'loaded'].includes(row.state)) ??
    []
  const selectedModel = chatModels.some((row) => row.model === model) ? model : (chatModels[0]?.model ?? '')
  const selectedKey = s?.keys.some((key) => key.id === keyId) ? keyId : (s?.keys[0]?.id ?? '')
  const endpoint = s?.api.endpoint ?? ''
  useEffect(() => {
    setProfile(null)
  }, [selectedModel, selectedKey, agent, endpoint])
  const token = async () => {
    const value = await w.execute('keys.reveal', selectedKey ? { id: selectedKey } : {})
    return typeof value === 'string' ? value : text(record(value).token ?? record(value).key, '')
  }
  const snippets: Record<string, string> = {
    curl: `curl ${JSON.stringify(`${endpoint}/chat/completions`)} \\\n  -H "Authorization: Bearer $ATOMIC_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify({ model: selectedModel, messages: [{ role: 'user', content: 'Hello' }] })}'`,
    python: `from openai import OpenAI\nimport os\nclient = OpenAI(base_url=${JSON.stringify(endpoint)}, api_key=os.environ["ATOMIC_API_KEY"])\nprint(client.chat.completions.create(model=${JSON.stringify(selectedModel)}, messages=[{"role": "user", "content": "Hello"}]))`,
    javascript: `import OpenAI from "openai";\nconst client = new OpenAI({ baseURL: ${JSON.stringify(endpoint)}, apiKey: process.env.ATOMIC_API_KEY });\nconsole.log(await client.chat.completions.create({ model: ${JSON.stringify(selectedModel)}, messages: [{ role: "user", content: "Hello" }] }));`,
  }
  return (
    <div className="server-page">
      <div className="page-heading">
        <h1>Server</h1>
        <Action onClick={openSetup}>Set up a workload</Action>
      </div>
      <nav className="subnav" aria-label="Server sections">
        {SERVER_SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            className={view === id ? 'active' : ''}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <SetupDetails workspace={w} />
      {view === 'connect' && (
        <>
          <Panel title="Power your agent">
            <p className="ew-muted">
              Keep working in your agent. This server supplies its model. Choose the agent below, then use its
              launch command or copy the connection details into an OpenAI-compatible agent.
            </p>
            <ConnectionSteps
              model={Boolean(selectedModel)}
              online={Boolean(s?.api.running)}
              hasKey={Boolean(selectedKey)}
              setup={openSetup}
              start={() => w.execute('api.start')}
            />
            <div className="connect-address">
              <code>{endpoint || 'Waiting for server'}</code>
              <Copy value={endpoint} label="Copy address" />
            </div>
            <div className="form-grid">
              <Field label="Model">
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    setModel(e.target.value)
                    setProfile(null)
                  }}
                >
                  <option value="">Load a model first</option>
                  {chatModels.map((service) => (
                    <option key={service.id} value={service.model}>
                      {service.model} · {service.kind}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="API key">
                <div className="inline-field">
                  <select
                    value={selectedKey}
                    onChange={(e) => {
                      setKeyId(e.target.value)
                      setProfile(null)
                    }}
                  >
                    {s?.keys.map((key) => (
                      <option key={key.id} value={key.id}>
                        {key.name} · {key.preview}
                      </option>
                    ))}
                  </select>
                  <Copy value={token} label="Copy API key" secret />
                </div>
              </Field>
            </div>
            <div className="agent-connect">
              <Field label="Agent">
                <select
                  value={agent}
                  onChange={(e) => {
                    setAgent(e.target.value)
                    setProfile(null)
                  }}
                >
                  <option value="atomic-agent">Atomic Agent</option>
                  <option value="claude">Claude Code</option>
                  <option value="codex">Codex</option>
                  <option value="opencode">OpenCode</option>
                </select>
              </Field>
              <Action
                primary
                disabled={!selectedModel || !selectedKey || !s?.api.running}
                onClick={async () =>
                  setProfile(
                    record(
                      await w.execute('connection.profile', {
                        agent,
                        model: selectedModel,
                        ...(selectedKey ? { key_id: selectedKey } : {}),
                      })
                    )
                  )
                }
              >
                Connect agent
              </Action>
            </div>
            {profile && selectedModel && selectedKey && s?.api.running && (
              <div className="agent-result">
                <div className="ew-actions">
                  <Copy
                    value={text(profile.launch_command ?? profile.command, '')}
                    label="Copy launch command"
                  />
                  {record(profile.profile).config !== undefined && (
                    <Copy
                      value={JSON.stringify(record(profile.profile).config, null, 2)}
                      label="Copy agent config"
                      secret
                    />
                  )}
                </div>
                <pre>{text(profile.launch_command ?? profile.command)}</pre>
                <details>
                  <summary>Connection configuration</summary>
                  <JsonResult value={profile} />
                </details>
              </div>
            )}
            <details className="request-example">
              <summary>Manual connection</summary>
              <div className="ew-actions">
                <select
                  aria-label="Example language"
                  value={snippet}
                  onChange={(e) => setSnippet(e.target.value)}
                >
                  <option value="curl">cURL</option>
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                </select>
                <Copy value={snippets[snippet]} label="Copy example" />
              </div>
              <pre>{snippets[snippet]}</pre>
              <small>Set ATOMIC_API_KEY to the copied key.</small>
            </details>
          </Panel>
          <details>
            <summary>Additional details: client keys</summary>
            <ServerKeys workspace={w} />
          </details>
          <details>
            <summary>Network access</summary>
            <Panel title="Access">
              <div className="ew-actions">
                <Action onClick={() => openCommand('remote.addresses')}>LAN addresses</Action>
                <Action onClick={() => openCommand('remote.status')}>Remote access</Action>
                <Action onClick={() => setView('runtime')}>Listen address & port</Action>
              </div>
            </Panel>
          </details>
        </>
      )}
      {view === 'traffic' && (
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
      )}
      {view === 'runtime' && (
        <>
          <RuntimeSettings workspace={w} />
          <Panel title="Runtime controls">
            <div className="ew-actions">
              {[
                'settings.get',
                'settings.update',
                'environments.list',
                'environments.probe',
                'environments.begin',
                'environments.resume',
              ].map((name) => (
                <Action key={name} onClick={() => openCommand(name)}>
                  {w.operations.find((op) => op.name === name)?.title ?? name}
                </Action>
              ))}
            </div>
          </Panel>
        </>
      )}
      {view === 'diagnostics' && (
        <>
          <Panel title="Diagnostics">
            <div className="ew-actions">
              {['logs.read', 'hardware.info', 'hardware.refresh', 'hardware.devices', 'models.logs'].map(
                (name) => (
                  <Action key={name} onClick={() => openCommand(name)}>
                    {w.operations.find((op) => op.name === name)?.title ?? name}
                  </Action>
                )
              )}
            </div>
          </Panel>
          <Panel title="Server report">
            <JsonResult value={{ core: s?.core, errors: s?.errors }} />
          </Panel>
        </>
      )}
    </div>
  )
}
