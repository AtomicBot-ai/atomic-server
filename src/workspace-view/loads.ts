/** The stages of a managed engine's load (`session:load-progress`), as a person reads them. */

import type { SessionLoadStage } from '@atomic-chat/core/contracts'

export const LOAD_STAGE_LABELS: Readonly<Record<SessionLoadStage, string>> = {
  'stopping-previous': 'Stopping the previous model',
  'starting-container': 'Starting the container',
  'initializing-engine': 'Initializing the engine',
  'ready': 'Ready',
}

const elapsed = (ms: number) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

/** `Starting the container (2s)`: the stage and the time the load has taken so far. */
export function loadStageText(load: { stage: string; elapsed_ms: number }): string {
  const label = (LOAD_STAGE_LABELS as Readonly<Record<string, string>>)[load.stage] ?? load.stage
  return `${label} (${elapsed(load.elapsed_ms)})`
}
