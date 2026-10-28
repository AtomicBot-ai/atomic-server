/** The bottom-right notice that a newer atc is out, from the workspace snapshot's `atc`. */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { UpdateToast } from './UpdateToast'

const atc = {
  version: '0.2.4',
  checked_at: 1,
  update: { version: '0.3.0', url: 'https://example.test/v0.3.0', command: 'atc update' },
}

describe('the update notice', () => {
  beforeEach(() => localStorage.clear())

  it('names the release, what installs it and where to read about it', () => {
    const { workspace } = workspaceFixture({}, { atc })
    render(<UpdateToast workspace={workspace} />)
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('atc 0.3.0 is out')
    expect(toast).toHaveTextContent('you run 0.2.4')
    expect(toast).toHaveTextContent('atc update')
    expect(screen.getByRole('link', { name: 'Release notes' })).toHaveAttribute('href', atc.update.url)
  })

  it('points at the release page when nothing installs it here', () => {
    const { workspace } = workspaceFixture({}, { atc: { ...atc, update: { ...atc.update, command: null } } })
    render(<UpdateToast workspace={workspace} />)
    expect(screen.getByRole('status')).not.toHaveTextContent('atc update')
    expect(screen.getByRole('link', { name: 'Release notes' })).toBeInTheDocument()
  })

  it('stays dismissed for that release, and comes back for the next', () => {
    const { workspace } = workspaceFixture({}, { atc })
    const first = render(<UpdateToast workspace={workspace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).toBeNull()
    first.unmount()
    render(<UpdateToast workspace={workspace} />)
    expect(screen.queryByRole('status')).toBeNull()
    const next = workspaceFixture({}, { atc: { ...atc, update: { ...atc.update, version: '0.3.1' } } })
    render(<UpdateToast workspace={next.workspace} />)
    expect(screen.getByRole('status')).toHaveTextContent('atc 0.3.1 is out')
  })

  it('shows nothing without a server, or while atc is the latest', () => {
    expect(render(<UpdateToast workspace={workspaceFixture({}).workspace} />).container).toBeEmptyDOMElement()
    const latest = workspaceFixture({}, { atc: { ...atc, update: null } })
    expect(render(<UpdateToast workspace={latest.workspace} />).container).toBeEmptyDOMElement()
  })
})
