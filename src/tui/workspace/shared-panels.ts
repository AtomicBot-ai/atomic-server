import { withEngineBuilds } from './library/engine-builds.js'
import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { WorkspaceController } from './controller.js'
import type { WorkspaceState } from './state.js'
import { libraryRows, record } from './library/library-model.js'

/** Poll only open local panels. Catalog searches and unsaved fields belong to this client. */
export function useSharedPanels(
  ready: boolean,
  latest: RefObject<WorkspaceState>,
  controller: RefObject<WorkspaceController | undefined>,
  update: (fn: (state: WorkspaceState) => WorkspaceState) => void
) {
  useEffect(() => {
    if (!ready) return
    let live = true,
      pending = false
    const poll = async () => {
      const c = controller.current,
        state = latest.current
      if (!c || pending) return
      pending = true
      try {
        if (
          state.firstRun === 'cloud' ||
          (state.page === 'models' && ['cloud', 'endpoint'].includes(state.libraryView))
        ) {
          const result = record(await c.runtime.read('cloud.list'))
          if (live && Array.isArray(result['providers']))
            update((s) => ({
              ...s,
              cloud: { ...s.cloud, providers: result['providers'] as WorkspaceState['cloud']['providers'] },
            }))
        }
        if (
          (state.page === 'models' && state.libraryView === 'engines') ||
          (state.overlay === 'engine-panel' && state.enginePanel?.kind === 'build')
        ) {
          const result = await c.runtime.read('engines.list')
          if (live)
            update((s) => {
              const rows = libraryRows(result, 'engines')
              const next =
                s.page === 'models' && s.libraryView === 'engines' ? { ...s, libraryRows: rows } : s
              const current = s.enginePanel
              const source = rows.find((row) => row.id === current?.engine)?.source
              return current?.kind === 'build' && source && !current.busy
                ? withEngineBuilds(next, current.engine, source)
                : next
            })
        }
        const panel = state.enginePanel
        if (panel?.mode === 'settings' && panel.form && !panel.busy) {
          const result = record(await c.runtime.read('settings.get', { provider: panel.engine }))
          if (live)
            update((s) => {
              const current = s.enginePanel
              if (
                current?.engine !== panel.engine ||
                current.mode !== 'settings' ||
                !current.form ||
                current.busy
              )
                return s
              return {
                ...s,
                enginePanel: {
                  ...current,
                  form: {
                    ...current.form,
                    values: record(result['values']),
                    ...(!Object.keys(current.form.draft).length && typeof result['revision'] === 'number'
                      ? { revision: result['revision'] }
                      : {}),
                  },
                },
              }
            })
        }
      } catch {
        // Keep the last status while the workspace connection retries; never clear an editor.
      } finally {
        pending = false
      }
    }
    const timer = setInterval(() => void poll(), 2500)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [ready, latest, controller, update])
}
