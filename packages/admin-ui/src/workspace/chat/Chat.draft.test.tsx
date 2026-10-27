import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { workspaceApi } from '../workspace-api'
import { Chat } from './Chat'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// "Open server" and the other readiness actions leave the Playground; the words typed so far must be
// there when the person comes back.
it('keeps the draft while the chat is away from the screen', async () => {
  const execute = vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  const { workspace } = workspaceFixture({})
  const first = render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  await waitFor(() => expect(execute).toHaveBeenCalledWith('history.list'))
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'this is my draft message' } })
  first.unmount()
  render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue('this is my draft message'))
})
