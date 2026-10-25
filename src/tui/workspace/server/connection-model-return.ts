import type { ActionContext } from '../actions.js'

/** A model picker belongs to its connection draft, never to an earlier onboarding stage. */
export function returnToConnection(
  ctx: Pick<ActionContext, 'get' | 'update'>,
  selection?: { model: string; provider: string; downloading?: boolean }
): boolean {
  if (!ctx.get().connection?.pickingModel) return false
  ctx.update((s) => ({
    ...s,
    connection: s.connection
      ? {
          ...s.connection,
          pickingModel: false,
          ...(selection ? { model: selection.model, provider: selection.provider, error: '' } : {}),
        }
      : null,
    page: s.firstRun ? 'welcome' : 'server',
    overlay: 'connection-guide',
    setup: selection?.downloading ? s.setup : null,
    focus: 'guide-model',
    hover: '',
    selected: 0,
  }))
  return true
}
