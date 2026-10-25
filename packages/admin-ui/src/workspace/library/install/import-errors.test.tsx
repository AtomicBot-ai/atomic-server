import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ImportModel } from './ImportModel'

it.each([
  [
    "ENOENT: no such file or directory, open '/missing.gguf'",
    'Model file not found. Check the path on this server and try again.',
  ],
  [
    'EACCES: permission denied',
    'The server cannot read this file. Choose a readable file or update its permissions.',
  ],
  ['Invalid GGUF header.', 'Invalid GGUF header.'],
])('explains an import error and preserves the path for retry: %s', async (failure, message) => {
  let fail = true
  const imported = vi.fn()
  const { workspace } = workspaceFixture({
    'models.import': () => {
      if (fail) throw new Error(failure)
      return { model_id: 'imported' }
    },
  })
  render(<ImportModel workspace={workspace} onClose={vi.fn()} onImported={imported} />)
  const path = screen.getByLabelText('Model file path')
  await userEvent.type(path, '/models/test.gguf')
  await userEvent.click(screen.getByRole('button', { name: 'Import model' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(path).toHaveValue('/models/test.gguf')
  expect(imported).not.toHaveBeenCalled()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Import model' }))
  await waitFor(() => expect(imported).toHaveBeenCalledOnce())
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
