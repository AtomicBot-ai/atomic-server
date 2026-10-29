/** Bound initialization, consent checks and network delivery by the same exit budget. */
export async function flushWithin(
  work: (remaining: () => number) => Promise<void>,
  timeoutMs = 2000
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = Date.now() + timeoutMs
  try {
    await Promise.race([
      work(() => Math.max(0, deadline - Date.now())),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs)
        timer.unref?.()
      }),
    ])
  } catch {
    /* Reporting cannot change the application's outcome. */
  } finally {
    clearTimeout(timer)
  }
}
