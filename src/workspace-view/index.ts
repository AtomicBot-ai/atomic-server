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
export { acceleratorLines, foundryVerdictText, prepareResultLines, variantLabel } from './foundry.js'
export { LOAD_STAGE_LABELS, loadStageText } from './loads.js'
