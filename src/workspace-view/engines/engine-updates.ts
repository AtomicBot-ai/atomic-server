/** Engine update feedback follows the core's offer, without comparing build versions in a client. */
export interface EngineUpdateCheck {
  phase: 'idle' | 'checking' | 'available' | 'current' | 'error'
  message: string
}

/** Interpret a completed refresh; a stale cached answer is never reported as up to date. */
export function engineUpdateResult(source?: Record<string, unknown>): EngineUpdateCheck {
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (!source) return { phase: 'error', message: 'This engine was not returned. Check again.' }
  const failure = source['source_error'] || record(source['error'])['message']
  if (failure) return { phase: 'error', message: `Could not check for updates: ${String(failure)}` }
  const update = record(source['update'])
  if (update['blocked_reason'])
    return {
      phase: 'error',
      message: `Update unavailable: ${String(update['blocked_reason']).replaceAll('-', ' ')}.`,
    }
  const target = record(update['target'])
  if (source['active'] && update['needed'] === true && target['version'])
    return { phase: 'available', message: `Update available: ${String(target['version'])}.` }
  if (!source['latest']) return { phase: 'error', message: 'No compatible build is available. Check again.' }
  if (!source['active']) return { phase: 'current', message: 'Ready to install.' }
  if (update['needed'] === false) return { phase: 'current', message: 'Engine is up to date.' }
  return { phase: 'error', message: 'Update status is unavailable. Check again.' }
}
