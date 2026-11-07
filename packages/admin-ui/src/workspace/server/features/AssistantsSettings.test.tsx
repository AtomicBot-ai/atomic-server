import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { DEFAULT_ASSISTANT, DEFAULT_ATTACHMENTS } from '@contract'
import { workspaceFixture } from '@/test/workspace-fixture'
import { AssistantsSettings } from './AssistantsSettings'

it('keeps the built-in assistant editable and locks default changes until they finish', async () => {
  let reject!: (error: Error) => void
  const { workspace, execute } = workspaceFixture(
    {
      'assistants.default': () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    },
    {
      features: {
        assistants: [DEFAULT_ASSISTANT, { ...DEFAULT_ASSISTANT, id: 'writer', name: 'Writing assistant' }],
        default_assistant: DEFAULT_ASSISTANT.id,
        skills: [],
        connectors: [],
        connector_status: {},
        attachments: DEFAULT_ATTACHMENTS,
      },
    }
  )
  render(<AssistantsSettings workspace={workspace} />)
  const builtIn = screen.getByRole('article', { name: DEFAULT_ASSISTANT.name })
  expect(within(builtIn).getByRole('button', { name: 'Edit' })).toBeEnabled()
  expect(within(builtIn).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
  const picker = screen.getByRole('combobox', { name: 'Default assistant' })
  await userEvent.click(picker)
  await userEvent.click(screen.getByRole('option', { name: 'Writing assistant' }))
  expect(picker).toBeDisabled()
  expect(execute).toHaveBeenCalledWith('assistants.default', { id: 'writer' })
  await act(async () => reject(new Error('Could not save the default.')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the default.')
  expect(picker).toBeEnabled()
})
