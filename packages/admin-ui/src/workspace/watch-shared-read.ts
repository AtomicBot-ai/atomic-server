/** Keep server-owned data current without remounting a panel or replacing its local draft. */
export function watchSharedRead<T>(
  read: () => Promise<T>,
  receive: (value: T) => void,
  failed: (error: unknown) => void
) {
  let live = true,
    pending = false
  const refresh = async () => {
    if (pending || !live) return
    pending = true
    try {
      const value = await read()
      if (live) receive(value)
    } catch (error) {
      if (live) failed(error)
    } finally {
      pending = false
    }
  }
  const visible = () => {
    if (!document.hidden) void refresh()
  }
  void refresh()
  const timer = setInterval(visible, 2500)
  document.addEventListener('visibilitychange', visible)
  return () => {
    live = false
    clearInterval(timer)
    document.removeEventListener('visibilitychange', visible)
  }
}
