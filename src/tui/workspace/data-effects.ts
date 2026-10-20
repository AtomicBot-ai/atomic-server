import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { WorkspaceController } from './controller.js'
import type { WorkspaceState } from './state.js'
import { persistConversation } from './data-actions.js'
import { setupAction } from './setup/setup-actions.js'
import { engineAction } from './library/engine-actions.js'
import { panelRefreshKey } from './library/engine-panel-model.js'
import { pathJob } from './setup/engine-setup.js'
import { setupWait } from '../../terminal-setup/index.js'
type Update = (fn: (s: WorkspaceState) => WorkspaceState) => void
export function useWorkspaceData(
  s: WorkspaceState,
  latest: RefObject<WorkspaceState>,
  c: RefObject<WorkspaceController | undefined>,
  update: Update
) {
  const polling = useRef(false)
  const opened = useRef<number | null>(null)
  useEffect(() => {
    if (s.setup?.stage !== 'ready' || s.setup.busy || s.setup.error || !c.current) return
    if (opened.current === s.setup.startedAt) return
    opened.current = s.setup.startedAt
    void setupAction('setup-finish', { controller: c.current, get: () => latest.current, update })
  }, [s.page, s.setup?.stage, s.setup?.busy, s.setup?.error, s.setup?.startedAt, c, latest, update])
  // Guided setup's engine path: once the server's job is ready, load the model and finish.
  const finished = useRef('')
  useEffect(() => {
    const v = s.setup,
      job = v?.path?.job
    if (!v || !job || v.busy || !c.current || finished.current === job.id) return
    if (pathJob(v, s.workspace)?.stage !== 'ready') return
    finished.current = job.id
    void setupAction('setup-path-finish', { controller: c.current, get: () => latest.current, update })
  }, [s.setup, s.workspace, c, latest, update])
  // The engine panel reads the core's state again when the live operation starts, moves on or ends.
  useEffect(() => {
    const p = s.enginePanel
    if (s.overlay !== 'engine-panel' || !p || p.busy || !c.current) return
    if (p.kind === 'managed' && !p.state) return
    if (panelRefreshKey(p, s.workspace) === p.seen) return
    void engineAction('engine-refresh', { controller: c.current, get: () => latest.current, update })
  }, [s.overlay, s.workspace, s.enginePanel, c, latest, update])
  useEffect(() => {
    if (!s.ready || !s.setupComplete) return
    let live = true
    const poll = async () => {
      if (polling.current || !c.current) return
      polling.current = true
      const endpoint = latest.current.endpoint
      try {
        const [local, remote] = await Promise.allSettled([c.current.installed(), c.current.models(endpoint)])
        if (!live || latest.current.endpoint !== endpoint) return
        update((v) => ({
          ...v,
          installed: local.status === 'fulfilled' ? local.value : v.installed,
          models: remote.status === 'fulfilled' ? remote.value : [],
          modelsUpdated: Date.now(),
          modelsError:
            remote.status === 'rejected' ? 'Endpoint offline. Start the server or check the connection.' : '',
        }))
      } finally {
        polling.current = false
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 5000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [s.ready, s.setupComplete, s.endpoint, c, latest, update])
  useEffect(() => {
    if (s.setup?.stage !== 'download' || s.setup.preparing) return
    const abort = new AbortController()
    let live = true,
      running = false
    const poll = async () => {
      if (running || !c.current) return
      running = true
      try {
        const progress = await setupWait(c.current.setup.progress(), abort.signal, 15000)
        if (live)
          update((v) =>
            !v.setup || (progress.manifest.complete && progress.manifest.startedAt < v.setup.startedAt)
              ? v
              : {
                  ...v,
                  ...(progress.ready ? { focus: 'setup-finish', hover: '' } : {}),
                  setup: v.setup
                    ? {
                        ...v.setup,
                        progress,
                        error: v.setup.error.startsWith('Connection:') ? '' : v.setup.error,
                        stage: progress.ready ? 'ready' : 'download',
                      }
                    : null,
                }
          )
      } catch (e) {
        if (live)
          update((v) => ({
            ...v,
            setup: v.setup
              ? {
                  ...v.setup,
                  error:
                    e instanceof Error && e.message === 'No installation is in progress.'
                      ? v.setup.error
                      : `Connection: ${e instanceof Error ? e.message : 'Waiting for the background service.'}`,
                }
              : null,
          }))
      } finally {
        running = false
      }
    }
    const timer = setInterval(() => void poll(), 800)
    return () => {
      live = false
      abort.abort()
      clearInterval(timer)
    }
  }, [s.page, s.setup?.stage, s.setup?.preparing, c, update])
  useEffect(() => {
    if (!latest.current.conversation || !latest.current.messages.length) return
    const controller = c.current
    if (!controller) return
    const save = () =>
      void persistConversation({ get: () => latest.current, controller })
        .then(async () => {
          if (!latest.current.generating) {
            const history = await controller.history.list()
            update((v) => ({ ...v, history }))
          }
        })
        .catch((e) => update((v) => ({ ...v, message: `Chat could not be saved: ${String(e)}` })))
    save()
    const timer = s.generating ? setInterval(save, 750) : undefined
    return () => {
      if (timer) clearInterval(timer)
      save()
    }
  }, [s.conversation?.id, s.generating, c, latest, update])
  useEffect(() => {
    if (!s.secret) return
    const timer = setTimeout(() => update((v) => ({ ...v, secret: '', overlay: null })), 60000)
    return () => clearTimeout(timer)
  }, [s.secret, update])
}
