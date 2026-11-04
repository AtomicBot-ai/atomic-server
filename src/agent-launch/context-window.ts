/**
 * The context window an agent is told about. Told nothing, an agent assumes 128K-272K and never compacts
 * before a 16K-64K local server refuses; given a window smaller than its own system prompt and tools, it
 * cannot finish a turn. The same numbers as the desktop app and the core's agent writers.
 */
import { AtcError } from '../errors/index.js'
import { endpointUrl } from '../terminal-service/index.js'

/** The least window a terminal coding agent works in. */
export const AGENT_MIN_CONTEXT = 32_768

/** The reply cap written beside a known window: a quarter of it, at most 8192. */
export function outputCap(contextLength: number): number {
  return Math.min(8192, Math.floor(contextLength / 4))
}

const positive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined

/**
 * The window `GET /v1/models` advertises for `model`: `context_length`, else llama-server's
 * `meta.n_ctx`. Undefined when the list does not say, as a core before 0.21 never does.
 */
export function servedWindow(models: unknown, model: string): number | undefined {
  const data = (models as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return undefined
  const entry = data.find((row) => (row as { id?: unknown } | null)?.id === model) as
    { context_length?: unknown; meta?: { n_ctx?: unknown } } | undefined
  return positive(entry?.context_length) ?? positive(entry?.meta?.n_ctx)
}

/** The served window of `model` from `<endpoint>/models`; undefined when unknown or unreadable. */
export async function readServedWindow(
  request: typeof fetch,
  endpoint: string,
  key: string,
  model: string
): Promise<number | undefined> {
  try {
    const response = await request(`${endpointUrl(endpoint)}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    })
    return response.ok ? servedWindow(await response.json(), model) : undefined
  } catch {
    // The agent still opens; it is only not told the window.
    return undefined
  }
}

/** Refuses a known window too small for the agent; an unknown one is left to the agent. */
export function checkAgentWindow(agent: string, model: string, contextLength: number | undefined): void {
  if (contextLength === undefined || contextLength >= AGENT_MIN_CONTEXT) return
  const tokens = (n: number) => n.toLocaleString('en-US')
  throw new AtcError(
    'ATC_USAGE',
    `${agent} needs a context window of at least ${tokens(AGENT_MIN_CONTEXT)} tokens; ${model} is served with ${tokens(contextLength)}.`,
    {
      hint: 'Load the model with a larger context size (turn off "Fit context to device memory" in the engine settings), or choose a smaller model.',
    }
  )
}
