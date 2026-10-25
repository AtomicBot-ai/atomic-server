import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ChatParameters } from './ChatParameters'
import { ChatToolbar } from './ChatToolbar'
import { CHAT_DEFAULTS } from './chat-preferences'
import type { useChatSession } from './useChatSession'
function Parameters({ disabled = false }: { disabled?: boolean }) {
  const [system, setSystem] = useState(''),
    [parameters, setParameters] = useState('{}')
  return (
    <ChatParameters
      system={system}
      setSystem={setSystem}
      parameters={parameters}
      setParameters={setParameters}
      preferences={CHAT_DEFAULTS}
      save={vi.fn()}
      disabled={disabled}
      provider="llamacpp-upstream"
    />
  )
}
it('opens request controls from the trailing icon and preserves edits when Escape closes the drawer', async () => {
  render(
    <ChatToolbar
      session={{ chat: {}, tabs: [] } as unknown as ReturnType<typeof useChatSession>}
      preferences={CHAT_DEFAULTS}
      save={vi.fn()}
      openSettings={vi.fn()}
      requestControls={<Parameters />}
    />
  )
  const button = screen.getByRole('button', { name: 'Request parameters' })
  expect(button.closest('.chat-toolbar-trailing')).toBeInTheDocument()
  expect(screen.queryByText('Request settings & prompt presets')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(button)
  expect(screen.getByRole('dialog', { name: 'Run settings' })).toBeVisible()
  await userEvent.type(screen.getByLabelText('System prompt'), 'Answer briefly.')
  await userEvent.type(screen.getByLabelText('Temperature'), '0.4')
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(button).toHaveFocus()
  await userEvent.click(button)
  expect(screen.getByLabelText('System prompt')).toHaveValue('Answer briefly.')
  expect(screen.getByLabelText('Temperature')).toHaveValue(0.4)
  await userEvent.click(screen.getByRole('button', { name: 'Close run settings' }))
  expect(button).toHaveFocus()
})
it('keeps generation parameters read-only while a response runs and dismisses on outside click', async () => {
  render(
    <>
      <Parameters disabled />
      <button>Outside</button>
    </>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Request parameters' }))
  expect(screen.getByLabelText('Temperature')).toBeDisabled()
  expect(screen.getByLabelText('System prompt')).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
