import { expect, it, vi } from 'vitest'
import { copyWorkspaceText } from './copy.js'

it('waits for native confirmation and does not overwrite the clipboard a second time', async () => {
  let finish!: (copied: boolean) => void
  const native = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  )
  const write = vi.fn(),
    notify = vi.fn()
  const copied = copyWorkspaceText('brew install cloudflared\natc restart', native, write, notify)
  expect(notify).toHaveBeenLastCalledWith('Copying…')
  finish(true)
  await copied
  expect(native).toHaveBeenCalledWith('brew install cloudflared\natc restart')
  expect(notify).toHaveBeenLastCalledWith('Copied to clipboard.')
  expect(write).not.toHaveBeenCalled()
})
it('uses OSC 52 for remote terminals and keeps errors visible', async () => {
  const write = vi.fn(),
    notify = vi.fn()
  await copyWorkspaceText('command', async () => false, write, notify)
  expect(write).toHaveBeenCalledWith(`\u001b]52;c;${Buffer.from('command').toString('base64')}\u0007`)
  expect(notify).toHaveBeenLastCalledWith('Sent to terminal clipboard.')
  write.mockClear()
  await copyWorkspaceText(
    'command',
    async () => {
      throw new Error('unavailable')
    },
    write,
    notify
  )
  expect(notify).toHaveBeenLastCalledWith('Could not copy. Select the command and copy it manually.')
  expect(write).not.toHaveBeenCalled()
})
