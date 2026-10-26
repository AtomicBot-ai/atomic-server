import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { DEFAULT_ATTACHMENTS } from '@contract'
import { ChatFeaturePicker } from './ChatFeaturePicker'

it('opens its dialog in the workspace, outside the composer that holds the button', async () => {
  // The composer sets its own dark ink; a dialog inside it inherits that ink on a dark surface.
  render(
    <div className="desktop-workspace">
      <div className="composer">
        <ChatFeaturePicker
          features={{
            assistants: [],
            default_assistant: '',
            connectors: [],
            connector_status: {},
            attachments: DEFAULT_ATTACHMENTS,
            skills: [],
          }}
          value={{ assistant: '', skills: [], connectors: [] }}
          onChange={vi.fn()}
          disabled={false}
        />
      </div>
    </div>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Assistant and tools' }))
  const dialog = screen.getByRole('dialog', { name: 'Assistant and tools' })
  expect(dialog.closest('.composer')).toBeNull()
  expect(dialog.closest('.desktop-workspace')).not.toBeNull()
})
