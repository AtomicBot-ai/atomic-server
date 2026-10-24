import type { WorkspaceSnapshot } from '../contract/index.js'

/** A manual choice skips onboarding, including older records that left `complete` false. */
export function setupFinished(setup: WorkspaceSnapshot['setup'] | undefined): boolean {
  return setup?.complete === true || setup?.mode === 'manual'
}
