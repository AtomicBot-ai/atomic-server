/** Bound a UI wait, even when a transport cannot abort an in-flight read. */
export function setupWait<T>(work: Promise<T>, signal: AbortSignal, ms = 45000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => finish(() => reject(new Error('Cancelled. Choose a model when you are ready.')))
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              'The service took too long to respond. Check your connection, then retry or choose another model.'
            )
          )
        ),
      ms
    )
    function finish(done: () => void) {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
      done()
    }
    signal.addEventListener('abort', cancel, { once: true })
    work.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    )
    if (signal.aborted) cancel()
  })
}
