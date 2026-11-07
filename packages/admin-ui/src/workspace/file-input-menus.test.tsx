import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { FileInput } from './FileInput'
import { FeatureMenu } from './server/features/FeatureMenu'
import { ChatMenu } from './chat/ChatMenu'

it('keeps the skill file picker mounted until the user chooses a file', async () => {
  const change = vi.fn()
  render(
    <FeatureMenu label="Create new skill">
      <FileInput label="Upload a skill" onChange={change} />
    </FeatureMenu>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Create new skill' }))
  const input = screen.getByLabelText('Upload a skill')
  await userEvent.click(screen.getByRole('button', { name: 'Choose file Upload a skill' }))
  expect(input).toBeInTheDocument()
  await userEvent.upload(input, new File(['# Skill'], 'skill.md'))
  expect(change).toHaveBeenCalledOnce()
})

it('skips the hidden native input when moving through chat menu actions', async () => {
  render(
    <ChatMenu label="History options">
      <button>Export</button>
      <FileInput label="Import conversations" onChange={vi.fn()} />
    </ChatMenu>
  )
  await userEvent.click(screen.getByRole('button', { name: 'History options' }))
  await userEvent.keyboard('{End}')
  expect(screen.getByRole('button', { name: 'Choose file Import conversations' })).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}')
  expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus()
})
