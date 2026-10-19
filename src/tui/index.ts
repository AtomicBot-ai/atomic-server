/**
 * The terminal UI (`atc tui`, and bare `atc` on a terminal): an Ink app over the daemon. Loaded
 * lazily by the command, so plain commands never pay for React and Ink.
 */
export { runTui } from './run-tui.js'
export type { RunTuiOptions } from './run-tui.js'
export type { TuiDeps } from './controller.js'
export type { TabId, PendingHostStep } from './state.js'
