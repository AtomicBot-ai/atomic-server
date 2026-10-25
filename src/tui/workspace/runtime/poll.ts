/**
 * Run `work` every `ms` until the returned stop is called: a tick is skipped while the last run is still
 * going, and `live()` tells a run that finishes after the stop not to touch state any more.
 */
export function pollEvery(
  ms: number,
  work: (live: () => boolean) => Promise<void>,
  options: { immediately?: boolean } = {}
): () => void {
  let live = true,
    running = false
  const run = async () => {
    if (running || !live) return
    running = true
    try {
      await work(() => live)
    } catch {
      // Each poller says what a failed read means for its own state; the next tick tries again.
    } finally {
      running = false
    }
  }
  if (options.immediately) void run()
  const timer = setInterval(() => void run(), ms)
  return () => {
    live = false
    clearInterval(timer)
  }
}
