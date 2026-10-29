import type { CoreLink } from '../core-link/index.js'

let gate: (() => void) | undefined
let held: Promise<void> | undefined

/** Register this command until `releaseCommandLease`. A second hold in this process is a no-op. */
export async function holdCommandLease(link: CoreLink, name: string): Promise<void> {
  if (held) return
  let resolveOpened: () => void = () => undefined
  let resolveEntered: () => void = () => undefined
  let rejectEntered: (error: unknown) => void = () => undefined
  const opened = new Promise<void>((resolve) => {
    resolveOpened = resolve
  })
  const entered = new Promise<void>((resolve, reject) => {
    resolveEntered = resolve
    rejectEntered = reject
  })
  gate = resolveOpened
  const pending = link
    .withLease(name, async () => {
      resolveEntered()
      await opened
    })
    .catch((error: unknown) => {
      rejectEntered(error)
      throw error
    })
  held = pending.then(
    () => undefined,
    () => undefined
  )
  try {
    await entered
  } catch (error) {
    gate = undefined
    held = undefined
    resolveOpened()
    throw error
  }
}

/** End the lease taken by `holdCommandLease`. A release with no hold is a no-op. */
export async function releaseCommandLease(): Promise<void> {
  if (!held) return
  const pending = held
  gate?.()
  gate = undefined
  held = undefined
  await pending
}
