import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ADMIN_API, DEFAULT_ATTACHMENTS } from '@contract'
import { workspaceApi } from '../workspace-api'
import { ChatAttachments } from './ChatAttachments'
vi.mock('../workspace-api', () => ({ workspaceApi: { execute: vi.fn() } }))
beforeEach(() => {
  vi.mocked(workspaceApi.execute).mockReset()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }))
})
afterEach(() => vi.restoreAllMocks())
const clientReports = () => vi.mocked(fetch).mock.calls.filter(([url]) => url === ADMIN_API.clientReports)
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

it.each([
  {
    name: 'image on a text-only model',
    vision: false,
    file: new File(['image'], 'image.png', { type: 'image/png' }),
    settings: DEFAULT_ATTACHMENTS,
    existing: [],
    message: 'This model cannot read images. Choose a vision model to attach one.',
  },
  {
    name: 'too many attachments',
    vision: false,
    file: new File(['text'], 'notes.txt', { type: 'text/plain' }),
    settings: DEFAULT_ATTACHMENTS,
    existing: Array.from({ length: 5 }, (_, i) => ({ name: `earlier-${i}.txt`, text: 'earlier' })),
    message: 'Attach at most five files per message.',
  },
  {
    name: 'oversized attachment',
    vision: false,
    file: new File([new Uint8Array(2 * 1024 * 1024)], 'large.txt', { type: 'text/plain' }),
    settings: { ...DEFAULT_ATTACHMENTS, max_file_size_mb: 1 },
    existing: [],
    message: 'Attachments must be below 1 MB.',
  },
  {
    name: 'unsupported image format',
    vision: true,
    file: new File(['gif'], 'image.gif', { type: 'image/gif' }),
    settings: DEFAULT_ATTACHMENTS,
    existing: [],
    message: 'Attach a PNG, JPEG or WebP image.',
  },
  {
    name: 'disabled document attachments',
    vision: false,
    file: new File(['text'], 'notes.txt', { type: 'text/plain' }),
    settings: { ...DEFAULT_ATTACHMENTS, enabled: false },
    existing: [],
    message: 'Enable document attachments in Settings first.',
  },
])(
  'keeps $name refusal visible locally without reporting a defect',
  async ({ vision, file, settings, existing, message }) => {
    vi.mocked(workspaceApi.execute).mockResolvedValue({ attachments: settings })
    const setAttachments = vi.fn()
    render(
      <ChatAttachments
        attachments={existing}
        setAttachments={setAttachments}
        disabled={false}
        vision={vision}
      />
    )
    // A chooser's accept filter is a hint; users can select another format with its All files option.
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText('Choose attachments'), file)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(setAttachments).not.toHaveBeenCalled()
    expect(clientReports()).toHaveLength(0)
  }
)

it('continues reporting unexpected attachment failures', async () => {
  const failure = new Error('Unexpected attachment failure')
  vi.mocked(workspaceApi.execute).mockRejectedValue(failure)
  render(<ChatAttachments attachments={[]} setAttachments={vi.fn()} disabled={false} vision={false} />)
  await userEvent.upload(
    screen.getByLabelText('Choose attachments'),
    new File(['text'], 'notes.txt', { type: 'text/plain' })
  )
  expect(await screen.findByRole('alert')).toHaveTextContent(failure.message)
  expect(clientReports()).toHaveLength(1)
  const body = String(clientReports()[0]?.[1]?.body)
  expect(JSON.parse(body)).toMatchObject({ kind: 'action', name: 'Error' })
  expect(body).not.toContain(failure.message)
})
