// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 5043013; adapted: live provider checks and server credential storage.
import { watchSharedRead } from '../watch-shared-read'
import { useEffect, useRef, useState } from 'react'
import { CLOUD_CATALOG } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { CloudProviderEditor } from './CloudProviderEditor'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import './cloud-providers.css'
import './onboarding-providers.css'
import { CloudProviderMark } from './CloudProviderMark'
import { CustomProviderSummary } from './CustomProviderSummary'
import { CloudProviderDialog } from './CloudProviderDialog'
export function CloudProviders({
  workspace: w,
  onboarding = false,
  onConnected,
  custom = false,
}: {
  workspace: Workspace
  onboarding?: boolean
  onConnected?: () => void
  custom?: boolean
}) {
  const editorSession = useRef(0)
  const initialProviders = useRef(false)
  const [providers, setProviders] = useState<RecordValue[]>([])
  const [provider, setProvider] = useState(onboarding ? 'openrouter' : '')
  const [url, setUrl] = useState(onboarding ? 'https://openrouter.ai/api/v1' : '')
  const [key, setKey] = useState('')
  const [models, setModels] = useState('')
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(onboarding)
  const [checking, setChecking] = useState(false)
  const { execute } = w
  useEffect(
    () =>
      watchSharedRead(
        () => execute('cloud.list'),
        (v) => {
          const saved = Array.isArray(record(v).providers) ? (record(v).providers as RecordValue[]) : []
          setProviders(saved)
          if (!initialProviders.current) {
            initialProviders.current = true
            if (custom && !saved.some((p) => !CLOUD_CATALOG.some((c) => c.id === p.provider)))
              setEditing(true)
          }
        },
        (e) => setError(String(e))
      ),
    [execute, revision, custom]
  )
  const choices = [
    ...CLOUD_CATALOG,
    ...providers
      .filter((p) => !CLOUD_CATALOG.some((c) => c.id === p.provider))
      .map((p) => ({
        id: text(p.provider),
        name: text(p.provider),
        icon: '[+]',
        url: text(p.base_url, ''),
      })),
    { id: '', name: 'Custom provider', icon: '[+]', url: '' },
  ]
  const closeEditor = () => {
    editorSession.current += 1
    setKey('')
    setEditing(false)
    setError('')
  }
  const saved = providers.find((p) => p.provider === provider)
  const validUrl = (() => {
    try {
      const parsed = new URL(url)
      return (
        ['http:', 'https:'].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash
      )
    } catch {
      return false
    }
  })()
  const connect = async () => {
    if (checking) return
    if (!provider.trim() || !validUrl) {
      setError('Enter a provider name and a valid HTTP or HTTPS endpoint.')
      return
    }
    editorSession.current += 1
    setChecking(true)
    setError('')
    try {
      const result = record(
        await execute('cloud.connect', {
          provider: provider.trim(),
          base_url: url.trim(),
          models: models
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
          ...(key ? { api_key: key } : {}),
        })
      )
      setProviders((p) => [...p.filter((v) => v.provider !== provider.trim()), result])
      setProvider(provider.trim())
      onConnected?.()
      setKey('')
      if (onboarding) {
        const currentIndex = choices.findIndex((p) => p.id === provider)
        const next = [...choices.slice(currentIndex + 1), ...choices.slice(0, currentIndex)].find(
          (p) => p.id && !providers.some((saved) => saved.provider === p.id && saved.connected)
        )
        if (next) {
          setProvider(next.id)
          setUrl(next.url)
          setModels('')
        }
      } else setEditing(false)
      setRevision((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }
  return (
    <div
      className={`cloud-providers${onboarding ? ' onboarding-providers' : ''}${editing ? ' has-provider-editor' : ''}`}
      aria-busy={checking}
    >
      {custom && (
        <CustomProviderSummary
          providers={providers.filter(
            (p) => p.provider === provider || !CLOUD_CATALOG.some((c) => c.id === p.provider)
          )}
          edit={(p) => {
            setProvider(text(p.provider, ''))
            setUrl(text(p.base_url, ''))
            setModels(Array.isArray(p.models) ? p.models.join(', ') : '')
            setKey('')
            setError('')
            editorSession.current += 1
            setEditing(true)
          }}
          add={() => {
            setProvider('')
            setUrl('')
            setModels('')
            setKey('')
            setError('')
            editorSession.current += 1
            setEditing(true)
          }}
        />
      )}
      {!custom && (
        <div className="cloud-provider-grid" aria-label="Cloud providers">
          {choices.map((p) => {
            const connected = providers.find((v) => v.provider === p.id)?.connected === true
            const pending = checking && provider === p.id
            return (
              <button
                type="button"
                key={p.id}
                aria-label={p.name}
                className={`cloud-provider-card ${connected ? 'connected' : ''} ${editing && provider === p.id ? 'selected' : ''}`}
                aria-pressed={editing && provider === p.id}
                disabled={checking || (onboarding && connected)}
                onClick={() => {
                  const config = providers.find((v) => v.provider === p.id)
                  setProvider(p.id)
                  setUrl(text(config?.base_url, p.url))
                  setModels(Array.isArray(config?.models) ? config.models.join(', ') : '')
                  setKey('')
                  setError('')
                  editorSession.current += 1
                  setEditing(true)
                }}
              >
                <CloudProviderMark provider={p.id} />
                <span>{p.name}</span>
                {pending ? (
                  <span className="cloud-provider-tag">
                    <i className="cloud-check-spinner" />
                    Checking
                  </span>
                ) : connected ? (
                  <span className="cloud-provider-tag">✓ Connected</span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
      {error && !editing && (
        <>
          <p role="alert" className="ew-error">
            {error}
          </p>
          <Action
            onClick={() => {
              setError('')
              setRevision((v) => v + 1)
            }}
          >
            Retry
          </Action>
        </>
      )}
      {editing && (
        <CloudProviderDialog
          inline={onboarding}
          name={choices.find((p) => p.id === provider)?.name ?? 'Custom provider'}
          checking={checking}
          onClose={closeEditor}
        >
          <CloudProviderEditor
            name={choices.find((p) => p.id === provider)?.name ?? 'Custom provider'}
            onboarding={onboarding}
            checking={checking}
            error={error}
            validUrl={validUrl}
            saved={saved}
            optionsOpen={custom || !choices.some((p) => p.id === provider && p.url)}
            value={{ provider, url, key, models }}
            change={(field, value) =>
              ({ provider: setProvider, url: setUrl, key: setKey, models: setModels })[field](value)
            }
            connect={connect}
            close={closeEditor}
            disconnect={async () => {
              const session = editorSession.current
              await execute('cloud.remove', { provider: saved?.provider })
              setRevision((v) => v + 1)
              if (session === editorSession.current) closeEditor()
            }}
          />
        </CloudProviderDialog>
      )}
    </div>
  )
}
