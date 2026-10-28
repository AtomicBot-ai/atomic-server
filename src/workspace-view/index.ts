/** Browser-safe view selectors shared with the terminal. */
export { downloadRows } from './downloads/downloads.js'
export { localModelStatus, catalogModelMatches } from './catalog/local-model-status.js'
export type { LocalModelIdentity, ModelDeviceStatus } from './catalog/local-model-status.js'
export { inferenceReadiness, setupModelPending } from './setup/inference-readiness.js'
export { OAUTH_POLL_MS, signInStep } from './connectors/connector-sign-in.js'
export type { SignInStep } from './connectors/connector-sign-in.js'
export {
  matchesEngineFilter,
  mentionsUncensored,
  modelEngines,
  toggleLike,
} from './catalog/catalog-filter.js'
export { downloadEta, downloadSpeed, formatEta, nextTransferSample } from './downloads/download-estimate.js'
export type { TransferSample } from './downloads/download-estimate.js'
export {
  CATALOG_FORMAT_LABELS,
  catalogFormatsFor,
  engineCatalogFormat,
  FORMAT_ENGINE,
} from './catalog/catalog-formats.js'
export type { CatalogFormat } from './catalog/catalog-formats.js'
export type { InferenceReadiness } from './setup/inference-readiness.js'
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
} from './games/mines.js'
export type { MineGame } from './games/mines.js'
export { modelImportError } from './catalog/model-import-error.js'
export { engineProgress } from './engines/engine-progress.js'
export type { EngineProgress } from './engines/engine-progress.js'
export type { DownloadRow } from './downloads/downloads.js'
export {
  connectionDownload,
  connectionDownloadTarget,
  connectionModelState,
  serverPanelSelection,
} from './setup/connection-model.js'
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
} from './engines/engines.js'
export { appleSiliconGpu } from './engines/hardware.js'
export { rebootLines, reloginLines } from './engines/engine-restart.js'
export type { EngineView, EngineViewKind } from './engines/engines.js'
export {
  acceleratorLabel,
  acceleratorLines,
  foundryVerdictText,
  prepareResultLines,
  variantLabel,
} from './engines/foundry.js'
export { liteRtAcceleratorLines, liteRtVariantLabel, liteRtVerdictText } from './engines/litert.js'
export { LOAD_STAGE_LABELS, loadStageText } from './engines/loads.js'
export { engineFamily, engineName, orderEngines } from './engines/engine-order.js'
export {
  changedValues,
  fieldText,
  fieldValue,
  formFields,
  gpuLabel,
  parseSettingValue,
} from './engines/settings-form.js'
export { engineApproval, engineRefreshKey, liveEngineState, updateLine } from './engines/engine-live.js'
export type { EngineApproval } from './engines/engine-live.js'
export {
  downloadOwner,
  downloadStopped,
  downloadHeld,
  downloadStateLabel,
  downloadControl,
} from './downloads/download-controls.js'
export type { DownloadOwner } from './downloads/download-controls.js'

export { setupFinished } from './setup/setup.js'

export { connectorToolBindings } from './connectors/connector-tools.js'
export {
  MCP_CONNECTORS,
  connectorTemplate,
  connectorDraft,
  connectorJson,
  parseConnectorJson,
} from './connectors/mcp-catalog.js'
export { WORKSPACE_COLORS } from './colors.js'
export { CLOUD_CATALOG, CLOUD_CONNECTION_NOTES } from './catalog/cloud-catalog.js'

export { prioritizeDownloads } from './downloads/downloads.js'
export { engineUpdateResult } from './engines/engine-updates.js'
export type { EngineUpdateCheck } from './engines/engine-updates.js'
export { chooseLoadEngine, installedEngines } from './engines/load-engine.js'
export type { EngineListing } from './engines/load-engine.js'

export { updateNotice } from './update/update-notice.js'
export { remoteSetupView } from './remote/remote-setup.js'
export type { RemoteSetupView } from './remote/remote-setup.js'
export { conversationPrint, savedConversationChange } from './chat/saved-conversation.js'
