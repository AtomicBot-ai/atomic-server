/** Browser-safe view selectors shared with the terminal. */
export { downloadRows } from './downloads.js'
export type { DownloadRow } from './downloads.js'
export {
  blockerLines,
  engineView,
  formatSize,
  operationView,
  PHASE_LABELS,
  phaseText,
  planBlocked,
  planLines,
  rebootLines,
  reloginLines,
  removalLines,
  verdictLine,
} from './engines.js'
export type { EngineView, EngineViewKind } from './engines.js'
export {
  acceleratorLabel,
  acceleratorLines,
  foundryVerdictText,
  prepareResultLines,
  variantLabel,
} from './foundry.js'
export { LOAD_STAGE_LABELS, loadStageText } from './loads.js'
export { engineName, orderEngines } from './engine-order.js'
export {
  changedValues,
  fieldText,
  fieldValue,
  formFields,
  gpuLabel,
  parseSettingValue,
} from './settings-form.js'
export { engineApproval, engineRefreshKey, liveEngineState } from './engine-live.js'
export type { EngineApproval } from './engine-live.js'
