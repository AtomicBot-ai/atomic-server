import type { DownloadProgress } from '@atomic-chat/core/contracts'
import type { CoreLink } from '../core-link/index.js'

/** Observe only this install; the core remains the owner of transfer and extraction. */
export function watchEngineDownload(
  link: CoreLink,
  taskId: string,
  onProgress: (progress: DownloadProgress) => void,
  lifetime?: AbortSignal
): () => void {
  const abort = new AbortController()
  const signal = lifetime ? AbortSignal.any([lifetime, abort.signal]) : abort.signal
  void link.events
    .subscribe(
      (message) => {
        if (message.event !== 'download:progress' || signal.aborted) return
        const data = message.data as { payload?: DownloadProgress } & DownloadProgress
        const progress = data.payload ?? data
        if (progress.taskId === taskId) onProgress(progress)
      },
      {
        signal,
        onSnapshot: (snapshot) => {
          const progress = snapshot.downloads.find((item) => item.taskId === taskId)
          if (progress && !signal.aborted) onProgress(progress)
        },
      }
    )
    .catch(() => {
      /* Transfer failure is reported by the installation request. */
    })
  return () => abort.abort()
}
