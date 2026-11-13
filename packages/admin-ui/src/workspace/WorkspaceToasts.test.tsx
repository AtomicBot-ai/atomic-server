/** The stacked corner notices: Review on an access request goes to Account → Remote models. */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import { accountFixture, remoteFixture } from '@/test/account-fixture'
import { workspaceFixture } from '@/test/workspace-fixture'
import type { Workspace } from './useWorkspace'
import { useWorkspaceNavigation } from './useWorkspaceNavigation'
import { WorkspaceToasts } from './WorkspaceToasts'

function Harness({ workspace }: { workspace: Workspace }) {
  const navigation = useWorkspaceNavigation()
  return (
    <>
      <output aria-label="Location">{`${navigation.page}/${navigation.accountSection}`}</output>
      <WorkspaceToasts workspace={workspace} navigation={navigation} />
    </>
  )
}

beforeEach(() => localStorage.clear())

it('stacks the update and the access request, and Review opens Account → Remote models', async () => {
  const { workspace } = workspaceFixture(
    {},
    {
      atc: {
        version: '0.2.4',
        checked_at: 1,
        update: { version: '0.3.0', url: 'https://example.test', command: null },
      },
      account: accountFixture({
        signed_in: true,
        user: { email: 'ann@example.com', display_name: null },
        remote: remoteFixture({
          sharing: true,
          requests: [
            {
              grant_id: 'g',
              device_name: 'MacBook',
              platform: 'macos',
              client_type: 'desktop',
              check_code: '936468',
              created_at: '2026-11-12T10:00:00Z',
            },
          ],
        }),
      }),
    }
  )
  const { container } = render(<Harness workspace={workspace} />)
  const stack = container.querySelector('.workspace-toasts')!
  expect(stack.querySelectorAll('[role="status"]')).toHaveLength(2)
  await userEvent.click(screen.getByRole('button', { name: 'Review' }))
  expect(screen.getByLabelText('Location')).toHaveTextContent('account/remote')
  expect(screen.queryByText(/MacBook asks for access/)).toBeNull()
  expect(screen.getByText('atc 0.3.0 is out')).toBeInTheDocument()
})
