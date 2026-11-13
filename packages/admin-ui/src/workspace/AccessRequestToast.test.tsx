/** The corner notice that a device asks for access, from `snapshot.account.remote.requests`. */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AccountRemoteRequest } from '@contract'
import { accountFixture, remoteFixture } from '@/test/account-fixture'
import { workspaceFixture } from '@/test/workspace-fixture'
import { AccessRequestToast } from './AccessRequestToast'

const request = (grant_id: string, device_name: string): AccountRemoteRequest => ({
  grant_id,
  device_name,
  platform: 'macos',
  client_type: 'desktop',
  check_code: '936468',
  created_at: '2026-11-12T10:00:00Z',
})
const withRequests = (requests: AccountRemoteRequest[], enabled = true) =>
  workspaceFixture(
    {},
    {
      account: accountFixture({
        enabled,
        signed_in: true,
        user: { email: 'ann@example.com', display_name: null },
        remote: remoteFixture({ sharing: true, requests }),
      }),
    }
  ).workspace

describe('the access request notice', () => {
  it('names the newest device with its check code and opens Remote access on Review', async () => {
    const onReview = vi.fn()
    render(
      <AccessRequestToast
        workspace={withRequests([request('a', 'Pixel'), request('b', 'MacBook')])}
        onReview={onReview}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'MacBook asks for access to this server — check code 936468'
    )
    await userEvent.click(screen.getByRole('button', { name: 'Review' }))
    expect(onReview).toHaveBeenCalled()
  })

  it('stays dismissed for that request, and comes back for a newer one', async () => {
    const first = render(
      <AccessRequestToast workspace={withRequests([request('a', 'Pixel')])} onReview={vi.fn()} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
    first.rerender(
      <AccessRequestToast
        workspace={withRequests([request('a', 'Pixel'), request('b', 'MacBook')])}
        onReview={vi.fn()}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('MacBook asks for access')
  })

  it('shows nothing without a request, while accounts are off, or on the page that lists requests', () => {
    const none = render(<AccessRequestToast workspace={withRequests([])} onReview={vi.fn()} />)
    expect(none.container).toBeEmptyDOMElement()
    const off = render(
      <AccessRequestToast workspace={withRequests([request('a', 'Pixel')], false)} onReview={vi.fn()} />
    )
    expect(off.container).toBeEmptyDOMElement()
    const hidden = render(
      <AccessRequestToast workspace={withRequests([request('a', 'Pixel')])} onReview={vi.fn()} hidden />
    )
    expect(hidden.container).toBeEmptyDOMElement()
    expect(
      render(<AccessRequestToast workspace={workspaceFixture({}).workspace} onReview={vi.fn()} />).container
    ).toBeEmptyDOMElement()
  })
})
