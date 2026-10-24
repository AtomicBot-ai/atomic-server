/** Browser-safe view selectors shared with the terminal. */
export { downloadRows } from './downloads.js'
export { localModelStatus, catalogModelMatches } from './local-model-status.js'
export type { LocalModelIdentity, ModelDeviceStatus } from './local-model-status.js'
export { inferenceReadiness, setupModelPending } from './inference-readiness.js'
export type { InferenceReadiness } from './inference-readiness.js'
export {
  newMineGame,
  neighbors,
  placeMines,
  flagMine,
  mineCount,
  minesOver,
  minesWon,
  revealMine,
  MINE_COUNT,
  SIDE,
} from './mines.js'
export type { MineGame } from './mines.js'
export { modelImportError } from './model-import-error.js'
export { engineProgress } from './engine-progress.js'
export type { EngineProgress } from './engine-progress.js'
export type { DownloadRow } from './downloads.js'
export { connectionDownload, connectionDownloadTarget, connectionModelState } from './connection-model.js'
export {
  blockerLines,
  engineView,
  formatSize,
  failureLines,
  operationEngine,
  operationView,
  otherOperationLine,
  PHASE_LABELS,
  phaseText,
  planBlocked,
  planLines,
  removalLines,
  verdictLine,
} from './engines.js'
export { rebootLines, reloginLines } from './engine-restart.js'
export type { EngineView, EngineViewKind } from './engines.js'
export {
  acceleratorLabel,
  acceleratorLines,
  foundryVerdictText,
  prepareResultLines,
  variantLabel,
} from './foundry.js'
export { LOAD_STAGE_LABELS, loadStageText } from './loads.js'
export { engineFamily, engineName, orderEngines } from './engine-order.js'
export {
  changedValues,
  fieldText,
  fieldValue,
  formFields,
  gpuLabel,
  parseSettingValue,
} from './settings-form.js'
export { engineApproval, engineRefreshKey, liveEngineState, updateLine } from './engine-live.js'
export type { EngineApproval } from './engine-live.js'
export { downloadOwner, downloadPaused, downloadControl } from './download-controls.js'
export type { DownloadOwner } from './download-controls.js'

export { setupFinished } from './setup.js'

export { connectorToolBindings } from './connector-tools.js'
export { connectorTemplate, connectorDraft, connectorJson, parseConnectorJson } from './mcp-catalog.js'

export { prioritizeDownloads } from './downloads.js'
export { engineUpdateResult } from './engine-updates.js'
export type { EngineUpdateCheck } from './engine-updates.js'
