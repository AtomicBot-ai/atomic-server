// Lifted from atomic-chat-ui routes/connectors/index.tsx @ 807b4d9; adapted: server-owned MCP catalog, browser sign-in and JSON configuration.
import { useState } from 'react'
import { Plus, Code } from 'lucide-react'
import { MCP_CONNECTORS } from '@contract'
import type { ConnectorConfig, ConnectorTemplate } from '@contract'
import { connectorDraft, connectorJson, connectorTemplate, parseConnectorJson } from '@view'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { ActionConfirmation } from '../ActionConfirmation'
import { FeatureEditor } from './FeatureEditor'
import { ConnectorCard } from './ConnectorCard'
import { ConnectorDialog, ConnectorJsonEditor, ConnectorSecret, ConnectorSignIn } from './ConnectorDialogs'
import { useConnectorSignIn } from './useConnectorSignIn'
import './connectors.css'
export function ConnectorsSettings({ workspace: w }: { workspace: Workspace }) {
  const [editor, setEditor] = useState<Record<string, unknown> | null>(null),
    [secret, setSecret] = useState<ConnectorTemplate | null>(null),
    [json, setJson] = useState<{ content: string; scope?: string } | null>(null),
    [remove, setRemove] = useState<ConnectorConfig | null>(null),
    [tools, setTools] = useState<ConnectorConfig | null>(null),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('')
  const data = w.snapshot?.features,
    configs = data?.connectors ?? [],
    signIn = useConnectorSignIn(w, setError)
  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy('')
    }
  }
  const install = async (template: ConnectorTemplate, key = '') => {
    const config = connectorDraft(template, key)
    await w.execute('connectors.save', { value: config })
    if (template.auth === 'oauth') await signIn.start(config.id, config.name)
    else await w.execute('connectors.check', { id: config.id })
  }
  const setup = (template: ConnectorTemplate) => {
    if (template.secret) setSecret(template)
    else void run(template.serverKey, () => install(template))
  }
  const edit = (config: ConnectorConfig) =>
    setEditor({
      ...config,
      args_text: JSON.stringify(config.args),
      env_text: JSON.stringify(config.env, null, 2),
      headers_text: JSON.stringify(config.headers, null, 2),
    })
  return (
    <>
      <div className="settings-actions">
        <Action
          primary
          onClick={() => setEditor({ type: 'http', args_text: '[]', env_text: '{}', headers_text: '{}' })}
        >
          <Plus size={16} />
          Add Server
        </Action>
        <Action onClick={() => setJson({ content: connectorJson(configs) })}>
          <Code size={16} />
          Import Config
        </Action>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="mcp-grid">
        {configs.map((config) => (
          <ConnectorCard
            key={config.id}
            config={config}
            template={connectorTemplate(config)}
            status={data?.connector_status[config.id]}
            busy={busy === config.id || Boolean(signIn.waiting?.url && signIn.waiting.id === config.id)}
            setup={() => void run(config.id, () => w.execute('connectors.check', { id: config.id }))}
            toggle={() =>
              void run(config.id, () =>
                w.execute('connectors.save', { value: { ...config, enabled: !config.enabled } })
              )
            }
            edit={() => edit(config)}
            json={() => setJson({ content: connectorJson([config]), scope: config.id })}
            tools={() => setTools(config)}
            remove={() => setRemove(config)}
            signin={() => void run(config.id, () => signIn.start(config.id, config.name))}
          />
        ))}
        {MCP_CONNECTORS.filter(
          (t) => !t.hidden && !configs.some((c) => connectorTemplate(c)?.serverKey === t.serverKey)
        ).map((t) => (
          <ConnectorCard
            key={t.serverKey}
            template={t}
            busy={busy === t.serverKey}
            setup={() => setup(t)}
            toggle={() => undefined}
            edit={() => undefined}
            json={() => undefined}
            tools={() => undefined}
            remove={() => undefined}
            signin={() => undefined}
          />
        ))}
      </div>
      {editor && (
        <FeatureEditor kind="connectors" initial={editor} workspace={w} close={() => setEditor(null)} />
      )}
      {secret && (
        <ConnectorSecret
          template={secret}
          close={() => setSecret(null)}
          connect={(key) => install(secret, key)}
        />
      )}
      {json !== null && (
        <ConnectorJsonEditor
          initial={json.content}
          close={() => setJson(null)}
          save={async (value) => {
            const parsed = parseConnectorJson(value)
            if (json.scope)
              parsed.mcpServers = {
                ...parseConnectorJson(connectorJson(configs.filter((c) => c.id !== json.scope))).mcpServers,
                ...parsed.mcpServers,
              }
            await w.execute('connectors.import', { value: parsed })
          }}
        />
      )}
      {remove && (
        <ActionConfirmation
          title={`Delete ${remove.name}?`}
          actionLabel="Delete"
          danger
          onClose={() => setRemove(null)}
          onConfirm={async () => {
            await w.execute('connectors.remove', { id: remove.id })
            setRemove(null)
          }}
        />
      )}
      {tools && (
        <ConnectorDialog title={`${tools.name} tools`} close={() => setTools(null)}>
          {!data?.connector_status[tools.id]?.tools.length ? (
            <p>Connect this server to discover its tools.</p>
          ) : (
            data.connector_status[tools.id]!.tools.map((tool) => (
              <div className="feature-tool" key={tool.name}>
                <strong>{tool.name}</strong>
                <p>{tool.description}</p>
              </div>
            ))
          )}
          <div className="ew-actions">
            <Action onClick={() => setTools(null)}>Close</Action>
          </div>
        </ConnectorDialog>
      )}
      {signIn.waiting && (
        <ConnectorSignIn
          waiting={signIn.waiting}
          retry={(id) => signIn.start(signIn.waiting!.id, signIn.waiting!.name, id)}
          cancel={() => void signIn.cancel()}
        />
      )}
    </>
  )
}
