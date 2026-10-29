/** Preserve a failure's owner across client decoding and nested local handlers. */
const remote = new WeakSet<object>()
const reported = new WeakSet<object>()

export function remoteError<T extends Error>(error: T): T {
  remote.add(error)
  return error
}

export function isRemoteError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && remote.has(error)
}

export function wasReported(error: unknown): boolean {
  return typeof error === 'object' && error !== null && reported.has(error)
}

export function markReported(error: unknown): void {
  if (typeof error === 'object' && error !== null) reported.add(error)
}
