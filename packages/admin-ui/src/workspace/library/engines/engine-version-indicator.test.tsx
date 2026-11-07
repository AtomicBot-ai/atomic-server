import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { EngineVersions } from './EngineVersions'
it('places Active next to the build identity, outside the action buttons', async () => {
  const { workspace } = workspaceFixture({})
  render(
    <EngineVersions
      provider="llamacpp-upstream"
      builds={[{ version: 'b12019', variant: 'win-vulkan-x64', active: true, removable: true }]}
      activeChoice="client"
      execute={workspace.execute}
      busy={false}
      onChanged={vi.fn()}
    />
  )
  await userEvent.click(screen.getByText('Installed versions (1)'))
  const active = screen.getByText('Active')
  expect(active.closest('.ew-actions')).toBeNull()
  expect(active.parentElement).toHaveTextContent('b12019')
  expect(screen.queryByRole('button', { name: 'Active' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
})
