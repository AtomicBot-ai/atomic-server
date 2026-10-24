import { setupFinished } from '../../workspace-view/index.js'
import { newSetup } from '../../terminal-setup/index.js'
import type { WorkspaceController } from './controller.js'
import { PAGE_FOCUS } from './state.js'
import type { Page, WorkspaceState } from './state.js'
export async function startup(c: WorkspaceController, initialPage?: Page): Promise<Partial<WorkspaceState>> {
  const [config, manifest, history, selectedEngine, setupState, catalogLikes] = await Promise.all([
    c.config(),
    c.setup.read(),
    c.history.list(),
    c.engineSelection.read(),
    c.runtime?.setup() ?? Promise.resolve(null),
    c.catalogLikes?.() ?? Promise.resolve([]),
  ])
  const ui = config.values.tui
  const complete = setupFinished(setupState) || manifest?.complete === true || manifest?.onboarded === true
  const setup =
    manifest && !manifest.complete && !setupFinished(setupState)
      ? {
          ...newSetup('server'),
          stage: 'download' as const,
          startedAt: manifest.startedAt,
          selections: manifest.selections,
          engine: `${manifest.engine.provider}|${manifest.engine.version}|${manifest.engine.backend}`,
        }
      : null
  const landing = 'server'
  const page = !complete
    ? 'welcome'
    : initialPage && !['welcome', 'setup'].includes(initialPage)
      ? initialPage
      : landing
  return {
    firstRun: complete ? null : setup ? 'permissions' : 'model',
    setupComplete: complete,
    setup,
    history,
    catalogLikes,
    page,
    settingsGroup: page === 'settings' ? 'tui' : 'api',
    endpoint: config.sources?.['tui.endpoint'] === 'default' ? await c.localEndpoint() : ui.endpoint,
    model: ui.model,
    motion: ui.motion,
    mouse: ui.mouse,
    engine:
      selectedEngine ||
      (manifest ? `${manifest.engine.provider}|${manifest.engine.version}|${manifest.engine.backend}` : ''),
    focus: !complete && setup ? 'first-permission:notifications' : PAGE_FOCUS[page],
    ready: true,
  }
}
