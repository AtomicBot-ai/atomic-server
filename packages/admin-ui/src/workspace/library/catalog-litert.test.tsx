import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'
import { LiteRtModelInstall } from './LiteRtModelInstall'

const row = (verdict: string) => ({
  origin: 'curated',
  model_id: 'gemma-4-e4b',
  name: 'Gemma 4 E4B',
  summary: '',
  license: null,
  gated: false,
  unverified: false,
  repo: 'litert-community/gemma',
  revision: 'abc',
  default_variant: 'gemma-4-e4b-cpu',
  variants: [
    {
      id: 'gemma-4-e4b-cpu',
      backend: 'cpu',
      file: { path: 'gemma.litertlm', size: 1000, sha256: 'x' },
      verdict: { verdict, reason: null, accelerator: null },
    },
  ],
})
const accelerators = { installed: false, build: null, accelerators: [], steps: [], preparing: false }

async function format(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  const formats = within(screen.getByText('Format', { selector: 'legend' }).parentElement!)
  await userEvent.click(await formats.findByRole('radio', { name, exact: true }))
  await userEvent.keyboard('{Escape}')
}

it('keeps LiteRT-LM variants inline, opens the engine dialog, and downloads after the plan', async () => {
  let installed = false
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'litert-lm']),
    'models.catalog': [],
    'models.installed': [],
    'artifacts.list': [],
    'models.search': () => ({ models: [row(installed ? 'ok' : 'engine-not-installed')] }),
    'litert.accelerators': accelerators,
    'litert.plan': { digest: 'litert-plan', blockers: [], download_bytes: 1000 },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await format('LiteRT-LM')
  expect(execute).toHaveBeenCalledWith('models.search', { engine: 'litert-lm', query: '' })
  await userEvent.click(await screen.findByText('Gemma 4 E4B', { selector: 'strong' }))
  expect(screen.getByLabelText('Variant')).toHaveValue('gemma-4-e4b-cpu')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Install LiteRT-LM' }))
  const dialog = within(await screen.findByRole('dialog', { name: 'LiteRT-LM', exact: true }))
  installed = true
  await userEvent.click(dialog.getByRole('button', { name: 'Close' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Download', exact: true }))
  expect(execute).toHaveBeenCalledWith('litert.plan', { model: 'gemma-4-e4b', variant: 'gemma-4-e4b-cpu' })
  expect(execute).toHaveBeenCalledWith('litert.install', {
    request_id: expect.stringMatching(/^admin-/),
    plan_digest: 'litert-plan',
  })
})

it('keeps a blocked LiteRT-LM variant editable and retries a failed install with the same request', async () => {
  let blocked = true,
    fail = true
  const { workspace, execute } = workspaceFixture({})
  execute.mockImplementation(async (name, input) => {
    if (name === 'litert.plan') return { digest: 'same', blockers: blocked ? ['Free disk space'] : [] }
    if (name === 'litert.install' && fail) throw new Error('Lost connection')
    return input ?? {}
  })
  render(
    <LiteRtModelInstall
      embedded
      workspace={workspace}
      model={row('ok') as never}
      onClose={vi.fn()}
      onEngine={vi.fn()}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Free disk space')
  expect(execute).not.toHaveBeenCalledWith('litert.install', expect.anything())
  blocked = false
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Lost connection')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  const requests = execute.mock.calls.filter(([name]) => name === 'litert.install').map(([, input]) => input)
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
})
