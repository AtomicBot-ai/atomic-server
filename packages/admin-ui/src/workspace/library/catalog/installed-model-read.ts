import type { Execute } from '../../types'

interface InstalledRecords {
  chat: unknown
  media: unknown
}
const pending = new WeakMap<Execute, Promise<InstalledRecords>>()
/** One installed-model scan per workspace, including across panel remounts. */
export async function readInstalledModels(execute: Execute, afterChange = false): Promise<InstalledRecords> {
  const current = pending.get(execute)
  if (current) {
    if (!afterChange) return current
    // A mutation needs a read started after it; wait for the old scan before scheduling that read.
    await current.catch(() => {})
    return readInstalledModels(execute)
  }
  const reading = Promise.allSettled([execute('models.installed'), execute('artifacts.list')])
    .then(([chat, media]) => {
      // An early failure must not release the slot while the other operation is still reading files.
      if (chat.status === 'rejected') throw chat.reason
      if (media.status === 'rejected') throw media.reason
      return { chat: chat.value, media: media.value }
    })
    .finally(() => pending.delete(execute))
  pending.set(execute, reading)
  return reading
}
