import { newSetup } from '../../terminal-setup/index.js'
import type { WorkspaceController } from './controller.js'
import { PAGE_FOCUS } from './state.js'
import type { Page, WorkspaceState } from './state.js'
export async function startup(c: WorkspaceController, initialPage?: Page): Promise<Partial<WorkspaceState>> {
  const [config, manifest, history, selectedEngine, setupState] = await Promise.all([
    c.config(),
    c.setup.read(),
    c.history.list(),
    c.engineSelection.read(),
    c.runtime?.setup() ?? Promise.resolve(null),
  ])
  const ui = config.values.tui
  const complete =
    setupState?.complete === true || manifest?.complete === true || manifest?.onboarded === true
  const setup =
    manifest && !manifest.complete && !setupState?.complete
      ? {
          ...newSetup(manifest.mode),
          stage: 'download' as const,
          startedAt: manifest.startedAt,
          selections: manifest.selections,
          engine: `${manifest.engine.provider}|${manifest.engine.version}|${manifest.engine.backend}`,
        }
      : null
  const landing =
    ui.mode === 'server' || (ui.mode === 'ask' && manifest?.mode === 'server') ? 'server' : 'chat'
  const page = !complete
    ? setup
      ? 'setup'
      : 'welcome'
    : initialPage && !['welcome', 'setup'].includes(initialPage)
      ? initialPage
      : landing
  return {
    setupComplete: complete,
    setup,
    history,
    page,
    endpoint: ui.endpoint,
    model: ui.model,
    motion: ui.motion,
    mouse: ui.mouse,
    engine:
      selectedEngine ||
      (manifest ? `${manifest.engine.provider}|${manifest.engine.version}|${manifest.engine.backend}` : ''),
    focus: page === 'setup' ? 'setup-pause' : PAGE_FOCUS[page],
    ready: true,
  }
}
