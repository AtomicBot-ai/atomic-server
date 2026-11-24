/** The Account section, as in the desktop app: a rail item above Help and its own tabs, only while accounts are on. */
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceAccount } from '@contract'
import { accountFixture, remoteFixture } from '@/test/account-fixture'
import { workspaceFixture } from '@/test/workspace-fixture'
import type { Page } from '../types'
import { WorkspaceNavigation } from '../WorkspaceNavigation'
import { RemoteAccess } from '../server/RemoteAccess'
import { Account } from './Account'

const user = { email: 'ann@example.com', display_name: null }

const navigation = (account: WorkspaceAccount | undefined = accountFixture(), page: Page = 'server') => {
  const navigate = vi.fn()
  const selectSection = vi.fn()
  render(
    <WorkspaceNavigation
      page={page}
      section="overview"
      task="chat"
      workspace={workspaceFixture({}, account ? { account } : {}).workspace}
      navigate={navigate}
      selectSection={selectSection}
      selectTask={vi.fn()}
      connectAgent={vi.fn()}
      openHelp={vi.fn()}
    />
  )
  const rail = within(screen.getByRole('navigation', { name: 'Main' }))
  return { rail, navigate, selectSection }
}

const accountPage = (account: WorkspaceAccount | undefined, accountSection = 'overview') => {
  const nav = { accountSection, setAccountSection: vi.fn(), setPage: vi.fn() }
  const { workspace } = workspaceFixture({}, account ? { account } : {})
  const view = render(<Account workspace={workspace} navigation={nav} />)
  return { nav, view }
}

describe('the Account rail item', () => {
  it('sits above Help while accounts are on and opens the Account section', async () => {
    const { rail, navigate } = navigation()
    const bottom = rail.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    expect(bottom.slice(-3)).toEqual(['Account', 'Help', 'Settings'])
    expect(rail.getByRole('button', { name: 'Account' })).toHaveAttribute('title', 'Sign in')
    await userEvent.click(rail.getByRole('button', { name: 'Account' }))
    expect(navigate).toHaveBeenCalledWith('account')
  })

  it('shows the initial of the signed-in account', () => {
    const { rail } = navigation(
      accountFixture({ signed_in: true, user: { email: 'ann@example.com', display_name: 'Mike' } })
    )
    const item = rail.getByRole('button', { name: 'Account' })
    expect(item).toHaveTextContent('MAccount')
    expect(item).toHaveAttribute('title', 'Signed in as Mike')
  })

  it('is not there while accounts are off, or off a server without accounts', () => {
    navigation(accountFixture({ enabled: false }))
    expect(screen.queryByRole('button', { name: 'Account' })).toBeNull()
  })
})

describe('the Account sidebar', () => {
  it('lists Overview and Remote models, as the desktop app does', async () => {
    const { selectSection } = navigation(accountFixture(), 'account')
    const nav = within(screen.getByRole('navigation', { name: 'Account sections' }))
    expect(nav.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Overview',
      'Remote models',
    ])
    await userEvent.click(nav.getByRole('button', { name: 'Remote models' }))
    expect(selectSection).toHaveBeenCalledWith('remote')
  })

  it('no longer lists Account in Settings', () => {
    navigation(accountFixture(), 'settings')
    const nav = within(screen.getByRole('navigation', { name: 'Settings sections' }))
    expect(nav.queryByRole('button', { name: 'Account' })).toBeNull()
  })
})

describe('the Account page', () => {
  it('signs in on Overview, and on Remote models too while nobody is signed in', () => {
    const overview = accountPage(accountFixture())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Account')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    overview.view.unmount()
    accountPage(accountFixture(), 'remote')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Remote models')
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('shares the server on Remote models once signed in, and Manage devices opens it', async () => {
    const signedIn = accountFixture({ signed_in: true, user })
    const overview = accountPage(signedIn)
    await userEvent.click(screen.getByRole('button', { name: 'Manage devices' }))
    expect(overview.nav.setAccountSection).toHaveBeenCalledWith('remote')
    overview.view.unmount()
    accountPage(signedIn, 'remote')
    expect(screen.getByRole('heading', { name: 'Share with your devices' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Share this server' })).toBeInTheDocument()
  })

  it('goes back to Server once accounts are turned off', () => {
    const { nav, view } = accountPage(accountFixture({ enabled: false }))
    expect(view.container).toBeEmptyDOMElement()
    expect(nav.setPage).toHaveBeenCalledWith('server')
  })
})

describe('Server → Remote access', () => {
  it('keeps the tunnel and the local network, and points at Remote models for the devices', async () => {
    const openRemoteModels = vi.fn()
    const account = accountFixture({
      signed_in: true,
      user,
      remote: remoteFixture({ sharing: true, tunnel: 'online', addresses: 1 }),
    })
    const { workspace } = workspaceFixture({}, { account })
    render(<RemoteAccess workspace={workspace} openRemoteModels={openRemoteModels} />)
    // The tunnel and LAN panels read their status on mount.
    await act(async () => {})
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Public remote access', 'Local network', 'Your devices'])
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText('Shared with your devices over the internet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open Remote models' }))
    expect(openRemoteModels).toHaveBeenCalled()
  })

  it('has no device line while accounts are off', async () => {
    render(<RemoteAccess workspace={workspaceFixture({}).workspace} openRemoteModels={vi.fn()} />)
    await act(async () => {})
    expect(screen.queryByRole('heading', { name: 'Your devices' })).toBeNull()
  })
})
