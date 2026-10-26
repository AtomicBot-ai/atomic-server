import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_ATTACHMENTS } from '@contract'
import { workspaceApi } from '../workspace-api'
import { ChatAttachments } from './ChatAttachments'
vi.mock('../workspace-api', () => ({ workspaceApi: { execute: vi.fn() } }))
beforeEach(() => vi.mocked(workspaceApi.execute).mockReset())
it('uploads a PDF to shared extraction and retains text for prompt-time retrieval', async () => {
  vi.mocked(workspaceApi.execute).mockImplementation(async (op) =>
    op === 'features.get' ? { attachments: DEFAULT_ATTACHMENTS } : { content: 'Extracted PDF text' }
  )
  const setAttachments = vi.fn()
  render(<ChatAttachments attachments={[]} setAttachments={setAttachments} disabled={false} vision={false} />)
  expect(screen.getByRole('button', { name: 'Attach files' })).toBeInTheDocument()
  await userEvent.upload(
    screen.getByLabelText('Choose attachments'),
    new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' })
  )
  await waitFor(() =>
    expect(setAttachments).toHaveBeenCalledWith([{ name: 'notes.pdf', text: 'Extracted PDF text' }])
  )
  expect(workspaceApi.execute).toHaveBeenCalledWith('attachments.parse', {
    name: 'notes.pdf',
    data: 'JVBERg==',
  })
  expect(workspaceApi.execute).not.toHaveBeenCalledWith('attachments.prepare', expect.anything())
})
it('shows an actionable warning for disabled document ingestion and keeps existing chips removable', async () => {
  vi.mocked(workspaceApi.execute).mockResolvedValue({
    attachments: { ...DEFAULT_ATTACHMENTS, enabled: false },
  })
  const setAttachments = vi.fn()
  render(
    <ChatAttachments
      attachments={[{ name: 'earlier.txt', text: 'hello' }]}
      setAttachments={setAttachments}
      disabled={false}
      vision={false}
    />
  )
  await userEvent.upload(
    screen.getByLabelText('Choose attachments'),
    new File(['notes'], 'notes.txt', { type: 'text/plain' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Enable document attachments')
  await userEvent.click(screen.getByRole('button', { name: 'Remove earlier.txt' }))
  expect(setAttachments).toHaveBeenCalledWith([])
})
it('never shows the file chooser itself, even while a reply streams and it is disabled', () => {
  // `.desktop-workspace input:disabled` outranks the rule that hid it, and "Browse… No files selected"
  // spread over the composer while Continue answer ran.
  const { rerender } = render(
    <ChatAttachments attachments={[]} setAttachments={vi.fn()} disabled={false} vision={false} />
  )
  expect(screen.getByLabelText('Choose attachments')).not.toBeVisible()
  rerender(<ChatAttachments attachments={[]} setAttachments={vi.fn()} disabled vision={false} />)
  expect(screen.getByLabelText('Choose attachments')).not.toBeVisible()
  expect(screen.getByRole('button', { name: 'Attach files' })).toBeDisabled()
})
