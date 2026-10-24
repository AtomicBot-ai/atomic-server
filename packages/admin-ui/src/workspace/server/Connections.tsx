// Lifted from Atomic-Chat/web-app/src/containers/server-concept/Connections.tsx @ 5043013; adapted: actual endpoints, prepared agent profiles, verified inference requests.
import { useState } from 'react'
import { Network, Plus } from 'lucide-react'
import { CONNECTION_AGENTS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action, Copy, Panel } from '../Controls'
import { AgentIcon } from './AgentIcon'
import { ServerKeyField } from './ServerKeyField'
import { ServiceConnections } from './ServiceConnections'

export function Connections({
  workspace: w,
  openCommand,
  openSetup,
  openKeys,
  connectAgent,
  prepared = [],
}: {
  workspace: Workspace
  openCommand: (name: string) => void
  openSetup: () => void
  openKeys: () => void
  connectAgent: (id: string) => void
  prepared?: string[]
}) {
  const [language, setLanguage] = useState('curl')
  const [verified, setVerified] = useState('')
  const [testing, setTesting] = useState(false)
  const s = w.snapshot
  const models =
    s?.services.filter((row) => row.kind === 'chat' && ['ready', 'loaded', 'running'].includes(row.state)) ??
    []
  const [chosen, setChosen] = useState('')
  const model = models.some((item) => item.model === chosen) ? chosen : (models[0]?.model ?? '')
  const endpoint = s?.api.endpoint ?? ''
  const requestKey = JSON.stringify([endpoint, model, s?.api.running])
  const snippets: Record<string, string> = {
    curl: `curl ${JSON.stringify(`${endpoint}/chat/completions`)} \\\n  -H "Authorization: Bearer $ATOMIC_API_KEY" \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify({ model, messages: [{ role: 'user', content: 'Hello' }] })}'`,
    python: `from openai import OpenAI\nimport os\n\nclient = OpenAI(base_url=${JSON.stringify(endpoint)}, api_key=os.environ["ATOMIC_API_KEY"])\nresponse = client.chat.completions.create(\n    model=${JSON.stringify(model)},\n    messages=[{"role": "user", "content": "Hello"}]\n)\nprint(response.choices[0].message.content)`,
  }
  return (
    <div className="server-connections">
      {!model ? (
        <div className="server-connection-empty">
          <Network size={32} />
          <h2>Connect your first tool</h2>
          <p>Choose a model and prepare your connection.</p>
          <Action primary onClick={openSetup}>
            Get started
          </Action>
        </div>
      ) : (
        <>
          <Panel title="Connection details">
            <div className="connect-address">
              <code>{endpoint}</code>
              <Copy value={endpoint} label="Copy URL" />
            </div>
            <dl className="server-connection-facts">
              <div>
                <dt>Model</dt>
                <dd>
                  {models.length > 1 ? (
                    <select
                      aria-label="Connection model"
                      value={model}
                      disabled={testing}
                      onChange={(e) => {
                        setChosen(e.target.value)
                        setVerified('')
                      }}
                    >
                      {models.map((item) => (
                        <option key={item.id} value={item.model}>
                          {item.model}
                        </option>
                      ))}
                    </select>
                  ) : (
                    model
                  )}
                </dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>
                  {['127.0.0.1', 'localhost', '::1'].includes(s?.api.host ?? '')
                    ? 'This device only'
                    : 'Local network'}
                </dd>
              </div>
              <div>
                <dt>Authentication</dt>
                <dd>API key</dd>
              </div>
            </dl>
            <ServerKeyField workspace={w} openKeys={openKeys} />
          </Panel>
          <Panel
            title="Prepared connections"
            actions={
              <Action onClick={openSetup}>
                <Plus size={15} />
                Add connection
              </Action>
            }
          >
            {prepared.length ? (
              prepared.map((id) => {
                const agent = CONNECTION_AGENTS.find((item) => item.id === id)
                return (
                  <div className="server-prepared-tool" key={id}>
                    {agent ? <AgentIcon id={id} label={agent.label} /> : <Network size={25} />}
                    <span>
                      <strong>{agent?.label ?? 'Custom endpoint'}</strong>
                      <small>Connection prepared</small>
                    </span>
                    <Action onClick={() => (agent ? connectAgent(id) : openSetup())}>Configure</Action>
                  </div>
                )
              })
            ) : (
              <p>No tools prepared in this session.</p>
            )}
          </Panel>
          <Panel
            title="Try a request"
            actions={
              <select
                aria-label="Example language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="curl">cURL</option>
                <option value="python">Python</option>
              </select>
            }
          >
            <pre>{snippets[language]}</pre>
            <p className="ew-muted">Set ATOMIC_API_KEY to your API key.</p>
            <div className="ew-actions">
              <Copy value={snippets[language]} label="Copy example" />
              <Action
                primary
                disabled={!s?.api.running || !s.keys.length}
                onClick={async () => {
                  setVerified('')
                  setTesting(true)
                  try {
                    await w.execute('setup.complete', { model_id: model })
                    setVerified(requestKey)
                  } finally {
                    setTesting(false)
                  }
                }}
              >
                Send test request
              </Action>
              {verified === requestKey && <span role="status">Model responded successfully.</span>}
            </div>
            {!s?.api.running && <p>Start the server to send a request.</p>}
          </Panel>
        </>
      )}
      <ServiceConnections workspace={w} openCommand={openCommand} />
    </div>
  )
}
