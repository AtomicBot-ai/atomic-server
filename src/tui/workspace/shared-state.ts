import { setupFinished } from '../../workspace-view/index.js'
import type { WorkspaceSnapshot } from '../../contract/index.js'
import { sampleDownloads } from './download-rates.js'
import type { WorkspaceState } from './state.js'

/** Shared status changes never replace local drafts or an explicitly reopened setup. */
export function applyWorkspaceSnapshot(
  state: WorkspaceState,
  workspace: WorkspaceSnapshot,
  now: number
): WorkspaceState {
  const completingHere = state.connection?.step === 'preparing' || state.connection?.step === 'done'
  const finished =
    setupFinished(workspace.setup) && !state.setupComplete && Boolean(state.firstRun) && !completingHere
  const onboardingPage = state.page === 'welcome' || state.page === 'setup'
  const closeOverlay =
    state.overlay === null ||
    [
      'connection-guide',
      'connection-model',
      'connection-engine',
      'waiting-game',
      'cloud',
      'setup-goal',
      'setup-permission',
    ].includes(state.overlay) ||
    (state.overlay === 'endpoint' && /^(cloud-|guide-)/.test(state.edit))
  return {
    ...state,
    workspace,
    clientKeys: workspace.keys,
    transferSamples: sampleDownloads(state.transferSamples, workspace, now),
    ...(setupFinished(workspace.setup) ? { setupComplete: true } : {}),
    ...(finished
      ? {
          firstRun: null,
          finalSetup: null,
          setup: null,
          connection: null,
          waitingGame: null,
          ...(onboardingPage
            ? {
                page: 'server' as const,
                ...(closeOverlay
                  ? { overlay: null, edit: '', editValue: '', focus: 'guide-open', hover: '' }
                  : {}),
                busy: false,
                message: '',
              }
            : {}),
        }
      : {}),
  }
}
