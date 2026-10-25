import { pollEvery } from '../runtime/poll.js'
import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceState } from '../state.js'
import { mediaJob, mediaRows, mediaTask, pendingMedia } from './media-model.js'

/** The job keeps running when the user switches panels; only its server status is polled. */
export function useMediaJobs(
  ready: boolean,
  latest: RefObject<WorkspaceState>,
  controller: RefObject<WorkspaceController | undefined>,
  update: (fn: (state: WorkspaceState) => WorkspaceState) => void
) {
  useEffect(() => {
    if (!ready) return
    return pollEvery(1500, async (live) => {
      const state = latest.current,
        c = controller.current
      if (!c || !pendingMedia(state) || !state.media.job?.['id']) return
      const id = state.media.job['id'],
        task = state.media.task
      try {
        const job = mediaJob(await c.runtime.execute(`media.${task}.job`, { id }))
        if (live())
          update((s) => (s.media.job?.['id'] === id ? { ...s, media: { ...s.media, job, error: '' } } : s))
        if (!pendingMedia({ ...state, media: { ...state.media, job } })) {
          const gallery = mediaRows(await c.runtime.execute(`media.${task}.gallery`))
          if (live())
            update((s) =>
              mediaTask(s) === task
                ? {
                    ...s,
                    media: {
                      ...s.media,
                      gallery,
                      selected: Math.max(0, Math.min(s.media.selected, gallery.length - 1)),
                    },
                  }
                : s
            )
        }
      } catch (error) {
        if (live())
          update((s) => ({
            ...s,
            media: { ...s.media, error: error instanceof Error ? error.message : String(error) },
          }))
      }
    })
  }, [ready, latest, controller, update])
}
