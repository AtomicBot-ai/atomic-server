import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { useWorkspace } from './useWorkspace'
import { workspaceApi } from './workspace-api'
import { WorkspaceApp } from './WorkspaceApp'
vi.mock('./useWorkspace', () => ({ useWorkspace: vi.fn() }))
vi.mock('@/hooks/useServiceHub', async (original) => ({
  ...(await original<typeof import('@/hooks/useServiceHub')>()),
  useServiceHub: () => ({}),
}))
vi.mock('./intro/EngineIntro', () => ({
  EngineIntro: ({ onContinue }: { onContinue: () => void }) => (
    <button onClick={onContinue}>Enter workspace</button>
  ),
}))
vi.mock('./server/Server', () => ({
  Server: ({ openModels }: { openModels: (engine: string) => void }) => (
    <button onClick={() => openModels('fastflowlm')}>Browse FLM models</button>
  ),
}))
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})
it('consumes an explicit engine navigation so ordinary reentry restores the later user choice', async () => {
  const { workspace } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'mlx', 'fastflowlm']),
    'models.installed': [],
    'artifacts.list': [],
    'models.search': { models: [] },
    'models.catalog': { rows: [] },
  })
  vi.mocked(useWorkspace).mockReturnValue(workspace)
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  render(<WorkspaceApp />)
  await userEvent.click(screen.getByRole('button', { name: 'Enter workspace' }))
  await userEvent.click(screen.getByRole('button', { name: 'Browse FLM models' }))
  await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
  const formats = () => within(screen.getByText('Format', { selector: 'legend' }).parentElement!)
  expect(await formats().findByRole('radio', { name: 'FastFlowLM' })).toBeChecked()
  await userEvent.click(formats().getByRole('radio', { name: 'MLX' }))
  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('button', { name: 'Server' }))
  await userEvent.click(screen.getByRole('button', { name: 'Models' }))
  await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
  expect(await formats().findByRole('radio', { name: 'MLX' })).toBeChecked()
  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('combobox', { name: 'Model category' }))
  await userEvent.click(screen.getByRole('option', { name: /Audio/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Server' }))
  await userEvent.click(screen.getByRole('button', { name: 'Models' }))
  expect(await screen.findByLabelText('Model category')).toHaveValue('audio')
})
