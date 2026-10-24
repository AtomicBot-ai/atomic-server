import { SETUP_GOALS } from '@contract'
import { Action, Empty, Field } from '../Controls'
import { SetupEngine } from './SetupEngine'
import { engineModels } from './setup-data'
import type { Workspace } from '../useWorkspace'
import { text } from '../types'
import type { RecordValue } from '../types'

export function SetupChoices({
  workspace,
  technical,
  engine,
  setEngine,
  engineConfirmed,
  confirmEngine,
  backToEngine,
  goal,
  setGoal,
  models,
  choice,
  setChoice,
  query,
  setQuery,
  loading,
  retry,
  access,
  setAccess,
  continueSetup,
  manual,
}: {
  workspace: Workspace
  technical: boolean
  engine: string
  setEngine: (id: string) => void
  engineConfirmed: boolean
  confirmEngine: () => void
  backToEngine: () => void
  goal: string
  setGoal: (id: string) => void
  models: RecordValue[]
  choice: string
  setChoice: (id: string) => void
  query: string
  setQuery: (value: string) => void
  loading: boolean
  retry: () => void
  access: string
  setAccess: (value: string) => void
  continueSetup: () => void
  manual: () => Promise<void>
}) {
  const selected = SETUP_GOALS.find((item) => item.id === goal) ?? SETUP_GOALS[0]
  const visible = engineModels(models, engine, selected.category).filter((model) =>
    `${model.title ?? ''} ${model.name ?? ''} ${model.id ?? ''}`.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <>
      {technical && (
        <Field label="Workload">
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            {SETUP_GOALS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <p className="setup-guidance">
        {selected.summary} {selected.guidance}
      </p>
      {!engineConfirmed ? (
        <SetupEngine
          workspace={workspace}
          category={selected.category}
          engine={engine}
          setEngine={setEngine}
          onContinue={confirmEngine}
        />
      ) : (
        <>
          <div className="ew-actions">
            <strong>Engine: {engine}</strong>
            <Action onClick={backToEngine}>Change engine</Action>
          </div>
          <Field
            label="2. Choose a model"
            hint="You will review files, download size and compatibility before anything is installed."
          >
            <input
              aria-label="Filter setup models"
              placeholder="Filter by model name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Setup model"
              size={4}
              value={choice}
              disabled={loading}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="">Choose a model</option>
              {visible.map((model) => (
                <option value={text(model.id)} key={text(model.id)}>
                  {text(model.title ?? model.name ?? model.id)}
                </option>
              ))}
            </select>
          </Field>
          {loading ? (
            <Empty>Loading models…</Empty>
          ) : (
            !visible.length && (
              <div role="status">
                <Empty>
                  {query
                    ? 'No models match. Clear the filter or try another name.'
                    : 'No models are available. Retry or choose another engine.'}
                </Empty>
                {query && <Action onClick={() => setQuery('')}>Clear filter</Action>}
                <Action onClick={retry}>Retry catalog</Action>
              </div>
            )
          )}
        </>
      )}
      <details className="setup-access">
        <summary>
          Access:{' '}
          {access === 'saved'
            ? 'saved configuration'
            : access === 'local'
              ? 'this computer only'
              : 'local network'}
        </summary>
        <Field label="Who can connect?">
          <select value={access} onChange={(e) => setAccess(e.target.value)}>
            <option value="saved">Use saved server configuration</option>
            <option value="local">This computer</option>
            <option value="lan">Local network</option>
          </select>
        </Field>
        {access === 'lan' && (
          <p className="notice">
            The API will listen on all network interfaces. Clients need an API key. This does not configure
            TLS or your firewall.
          </p>
        )}
      </details>
      <div className="wizard-bottom">
        {engineConfirmed && (
          <Action
            primary
            disabled={!engineConfirmed || loading || !visible.some((model) => model.id === choice)}
            onClick={continueSetup}
          >
            Review model
          </Action>
        )}
        <Action onClick={manual}>Set up later</Action>
      </div>
    </>
  )
}
