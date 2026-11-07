import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { DEFAULT_ASSISTANT, DEFAULT_ATTACHMENTS } from '@contract'
import { workspaceFixture } from '@/test/workspace-fixture'
import { AttachmentSettings } from './AttachmentSettings'

it('preserves an empty numeric draft and prevents invalid or overlapping chunks from being saved', async () => {
  const { workspace, execute } = workspaceFixture({})
  render(<AttachmentSettings workspace={workspace} />)
  const size = screen.getByRole('spinbutton', { name: /Maximum file size/ })
  await userEvent.clear(size)
  expect(size).toHaveValue(null)
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await userEvent.type(size, '20')
  await userEvent.click(screen.getByText('Advanced retrieval'))
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Chunk overlap' }), { target: { value: '2000' } })
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('smaller than chunk size')
  expect(execute).not.toHaveBeenCalled()
})

it('locks the draft while saving, keeps failures editable, and retains an acknowledged save before the snapshot updates', async () => {
  let finish!: (value: unknown) => void
  let fail!: (error: Error) => void
  const { workspace } = workspaceFixture({
    'attachments.update': () =>
      new Promise((resolve, reject) => {
        finish = resolve
        fail = reject
      }),
  })
  const { rerender } = render(<AttachmentSettings workspace={workspace} />)
  const size = screen.getByRole('spinbutton', { name: /Maximum file size/ })
  fireEvent.change(size, { target: { value: '20' } })
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(size).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled()
  await act(async () => fail(new Error('Save failed')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Save failed')
  expect(size).toBeEnabled()
  expect(size).toHaveValue(20)
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await act(async () => finish({}))
  expect(size).toHaveValue(20)
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  rerender(
    <AttachmentSettings
      workspace={{
        ...workspace,
        snapshot: {
          ...workspace.snapshot!,
          features: {
            assistants: [DEFAULT_ASSISTANT],
            default_assistant: DEFAULT_ASSISTANT.id,
            skills: [],
            connectors: [],
            connector_status: {},
            attachments: { ...DEFAULT_ATTACHMENTS },
          },
        },
      }}
    />
  )
  expect(size).toHaveValue(20)

  fireEvent.change(size, { target: { value: '21' } })
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(size).toHaveValue(20)
})
