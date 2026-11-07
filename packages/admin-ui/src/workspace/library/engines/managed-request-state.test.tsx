import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { operation, plan } from '../../../../../../test/helpers/managed-fixtures'
import { EngineSetup } from './EngineSetup'

it('keeps the managed request visible and disabled across closing and reopening', async () => {
  let finish!: () => void
  let pending = false
  const { workspace, execute } = workspaceFixture({
    'engines.plan': () => ({
      engine: 'vllm',
      plan: plan('vllm'),
      installation: null,
      operation: pending ? operation('vllm', 'pulling-image') : null,
      notices: [],
      models_kept_for: [],
    }),
    'engines.operate': () =>
      new Promise<void>((resolve) => {
        finish = () => {
          pending = true
          resolve()
        }
      }),
  })
  const props = { workspace, engine: 'vllm', onClose: () => {} }
  const ui = render(<EngineSetup {...props} />)
  await userEvent.dblClick(await screen.findByRole('button', { name: 'Agree and install' }))
  ui.unmount()
  const reopened = render(<EngineSetup {...props} />)
  expect(await screen.findByRole('status')).toHaveTextContent('Applying request…')
  expect(await screen.findByRole('button', { name: 'Applying request…' })).toBeDisabled()
  expect(execute.mock.calls.filter(([name]) => name === 'engines.operate')).toHaveLength(1)
  await act(async () => {
    workspace.snapshot!.engines = [
      { engine: 'vllm', installation: null, operation: operation('vllm', 'pulling-image') },
    ]
    finish()
  })
  reopened.rerender(<EngineSetup {...props} workspace={{ ...workspace }} />)
  expect(await screen.findByText(/Downloading the engine image/)).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Agree and install' })).not.toBeInTheDocument()
})
