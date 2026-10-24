import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { EngineBuilds } from './EngineBuilds'

const entry = {
  engine: 'llamacpp-upstream',
  kind: 'llamacpp',
  builds: [],
  active: { version: 'b1', variant: 'cpu' },
  latest: { version: 'b2', variant: 'cpu' },
  update: { needed: false, target: null },
}

it('shows checking, then replaces the same action only after an available update', async () => {
  let finish!: (value: unknown) => void
  const { workspace, execute } = workspaceFixture({
    'engines.list': (input: Record<string, unknown>) =>
      input.force
        ? new Promise((resolve) => {
            finish = resolve
          })
        : { engines: [entry] },
  })
  render(<EngineBuilds provider="llamacpp-upstream" execute={workspace.execute} />)
  await screen.findByText('Active: b1')
  expect(screen.queryByRole('button', { name: 'Install latest build' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
  expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Checking for updates')
  await act(async () => finish({ engines: [{ ...entry, update: { needed: true, target: entry.latest } }] }))
  expect(screen.getByRole('status')).toHaveTextContent('Update available: b2')
  await userEvent.click(screen.getByRole('button', { name: 'Install latest build' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('engines.enqueue', { engine: 'llamacpp-upstream' })
  )
  expect(screen.getByRole('status')).toHaveTextContent('Download queued')
})

it('keeps rechecking available after current, failed and stale-cache results', async () => {
  let outcome: unknown = { engines: [entry] }
  const { workspace } = workspaceFixture({
    'engines.list': () => {
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  })
  render(<EngineBuilds provider="llamacpp-upstream" execute={workspace.execute} />)
  await screen.findByText('Active: b1')
  const check = () => userEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
  await check()
  expect(screen.getByRole('status')).toHaveTextContent('up to date')
  outcome = new Error('Offline')
  await check()
  expect(screen.getByRole('alert')).toHaveTextContent('Offline')
  outcome = { engines: [{ ...entry, source: 'cache', source_error: 'Network unavailable' }] }
  await check()
  expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
  expect(screen.queryByText('Engine is up to date.')).not.toBeInTheDocument()
  outcome = { engines: [entry] }
  await check()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('up to date')
})
