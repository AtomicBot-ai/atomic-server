import type { WorkspaceState } from './state.js'
import { workspacePage } from './navigation.js'
/** One back action shared by keyboard routing and the clickable footer. */
export function escapeAction(s: WorkspaceState): { id: string; label: string } {
  if (s.overlay === 'waiting-game') return { id: 'waiting-game-close', label: 'Back' }
  if (s.overlay === 'cloud') return { id: s.cloud.checking ? '' : 'cloud-close', label: 'Back' }
  if (s.overlay === 'connection-guide')
    return {
      id:
        s.connection?.step === 'preparing'
          ? ''
          : !s.firstRun
            ? 'guide-close'
            : s.connection?.step === 'choose'
              ? s.firstRun
                ? 'first-back'
                : 'guide-close'
              : s.connection?.step === 'done'
                ? 'guide-close'
                : 'guide-back',
      label: 'Back',
    }
  if (s.overlay) return { id: 'close', label: 'Back' }
  if (s.finalSetup) return { id: 'wait-back', label: 'Back' }
  if (s.page === 'welcome')
    return { id: s.firstRun === 'model' ? 'first-intro' : 'first-back', label: 'Back' }
  if (s.setup && (s.page === 'setup' || s.page === 'models')) {
    if (s.firstRun === 'model' && s.setup.stage === 'models' && !s.connection?.pickingModel)
      return { id: 'first-intro', label: 'Back' }
    if (s.setup.preparing)
      return { id: 'setup-cancel', label: s.setup.error || s.setup.progress?.error ? 'Back' : 'Cancel' }
    if (s.connection?.pickingModel && !s.setup.repository)
      return { id: 'guide-model-back', label: 'Back to connection' }
    if (['download', 'ready'].includes(s.setup.stage))
      return { id: s.firstRun ? 'first-continue' : 'library-close', label: 'Back' }
    return {
      id: s.setup.repository
        ? 'setup-back'
        : s.setup.stage === 'engine'
          ? s.setupComplete
            ? 'library-close'
            : 'setup-intro'
          : 'setup-engine-back',
      label: 'Back',
    }
  }
  if (workspacePage(s) === 'access') return { id: 'settings-back', label: 'Back' }
  return { id: 'section-menu', label: 'Sections' }
}
