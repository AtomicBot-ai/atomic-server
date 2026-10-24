import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { workspaceApi } from '../workspace-api'
import { ChatTools } from './ChatTools'
const binding = { id: 'project', tool: 'read_project', name: 'mcp_project_read', definition: {} } as never
const message = (args = '{"path":"README.md"}') => ({
  tool_calls: [{ id: 'call-1', function: { name: 'mcp_project_read', arguments: args } }],
})
afterEach(() => vi.restoreAllMocks())
it('runs a connector only after approval and continues with its result', async () => {
  const execute = vi
    .spyOn(workspaceApi, 'execute')
    .mockResolvedValue({ content: [{ type: 'text', text: 'Project information' }] } as never)
  const submit = vi.fn().mockResolvedValue(undefined)
  render(<ChatTools message={message()} submit={submit} disabled={false} connectors={[binding]} />)
  expect(execute).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Continue with tool results' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Approve & run read_project' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('connectors.call', {
      id: 'project',
      tool: 'read_project',
      arguments: { path: 'README.md' },
    })
  )
  await userEvent.click(screen.getByRole('button', { name: 'Continue with tool results' }))
  expect(submit).toHaveBeenCalledWith([
    {
      role: 'tool',
      tool_call_id: 'call-1',
      content: '{"content":[{"type":"text","text":"Project information"}]}',
    },
  ])
})
it('keeps invalid tool arguments unexecuted and lets the user deny the call', async () => {
  const execute = vi.spyOn(workspaceApi, 'execute')
  render(<ChatTools message={message('[]')} submit={vi.fn()} disabled={false} connectors={[binding]} />)
  await userEvent.click(screen.getByRole('button', { name: 'Approve & run read_project' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Tool arguments must be a JSON object.')
  expect(execute).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Deny call' }))
  expect(screen.getByLabelText('Result for mcp_project_read')).toHaveValue(
    '{"error":"User denied this tool call."}'
  )
  expect(screen.getByRole('button', { name: 'Continue with tool results' })).toBeEnabled()
})
