import type { connectorToolBindings } from '@view'
import { Action } from '../Controls'
import { rows } from '../types'
import type { RecordValue } from '../types'
import type { useChatSession } from './useChatSession'
import { ChatTools } from './ChatTools'
import { ChatFailure } from './ChatFailure'

export function ChatTurnStatus({
  session: s,
  messages,
  bindings,
  serviceReady,
  generate,
  onCatalog,
}: {
  session: ReturnType<typeof useChatSession>
  messages: RecordValue[]
  bindings: ReturnType<typeof connectorToolBindings>
  serviceReady: boolean
  generate: (messages: RecordValue[]) => Promise<void>
  onCatalog: (section?: string) => void
}) {
  const last = messages.at(-1)
  const answer =
    typeof last?.content === 'string'
      ? last.content
      : rows(last?.content)
          .map((part) => (typeof part.text === 'string' ? part.text : ''))
          .join('')
  const toolsPending = last?.role === 'assistant' && rows(last.tool_calls).length > 0
  return (
    <>
      {s.busy && (
        <p role="status">
          {s.job.state === 'stopping'
            ? 'Stopping…'
            : s.job.state === 'generating'
              ? 'Generating…'
              : 'Waiting for the engine…'}{' '}
          {s.job.duration_ms ? `${(Number(s.job.duration_ms) / 1000).toFixed(1)}s` : ''}
        </p>
      )}
      {s.error && <ChatFailure error={s.error} onCatalog={onCatalog} />}
      {toolsPending && !s.busy && (
        <ChatTools
          key={JSON.stringify(last.tool_calls)}
          message={last}
          connectors={bindings}
          disabled={s.busy}
          submit={(results) => generate([...messages, ...results])}
        />
      )}
      {!s.busy && last?.role === 'user' && (
        <Action disabled={!serviceReady} onClick={() => generate(messages)}>
          Generate from here
        </Action>
      )}
      {!s.busy && last?.role === 'assistant' && !toolsPending && !answer.trim() && s.error && (
        <Action disabled={!serviceReady} onClick={() => generate(messages.slice(0, -1))}>
          Retry answer
        </Action>
      )}
      {!s.busy && last?.role === 'assistant' && !toolsPending && Boolean(answer.trim()) && (
        <Action
          disabled={!serviceReady}
          onClick={() =>
            generate([
              ...messages,
              { role: 'user', content: 'Continue your previous answer from where you stopped.' },
            ])
          }
        >
          Continue answer
        </Action>
      )}
    </>
  )
}
