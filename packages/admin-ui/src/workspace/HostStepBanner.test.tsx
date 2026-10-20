/** The privileged step the server waits on, in the admin's Cockpit and Server page (spec managed-engines-server). */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { statusFixture } from '@/test/fixtures'
import { Cockpit } from './Cockpit'
import { HostStepBanner } from './HostStepBanner'

const step = {
  step_id: 's1',
  operation_id: 'op-tensorrt-llm',
  instructions: 'sudo /usr/local/bin/atc host-step exec /srv/atc/run/host-steps/s1.request.json',
  updated_at: 1,
}

describe('the privileged step banner', () => {
  it('shows the exact command from the snapshot with a copy button', () => {
    const { workspace } = workspaceFixture({}, { host_steps: [step] })
    render(<HostStepBanner workspace={workspace} />)
    expect(screen.getByRole('status')).toHaveTextContent(step.instructions)
    expect(screen.getByRole('button', { name: 'Copy command' })).toBeInTheDocument()
  })

  it('shows nothing while no step waits', () => {
    const { workspace } = workspaceFixture({})
    const { container } = render(<HostStepBanner workspace={workspace} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is part of the Cockpit', () => {
    const { workspace } = workspaceFixture({}, { host_steps: [step] })
    render(<Cockpit workspace={workspace} navigate={() => {}} />)
    expect(screen.getByText(step.instructions)).toBeInTheDocument()
  })

  it('the status fixture names no command that does not exist', () => {
    expect(statusFixture().pending_host_steps).toEqual([])
  })
})
