import { expect, it, vi } from 'vitest'
import { chatFeatureAction, pendingToolCalls } from './features.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import type { ActionContext } from '../action-types.js'
import { DEFAULT_ASSISTANT, DEFAULT_ATTACHMENTS } from '../../../contract/index.js'
import { connectorToolBindings } from '../../../workspace-view/index.js'
const features = {
  assistants: [DEFAULT_ASSISTANT],
  default_assistant: 'atomic-chat',
  skills: [],
  connectors: [
    {
      id: 'echo',
      name: 'Echo',
      enabled: true,
      type: 'http' as const,
      url: 'http://localhost/mcp',
      command: '',
      args: [],
      headers: {},
      env: {},
      timeout: 30,
    },
  ],
  connector_status: { echo: { state: 'connected' as const, tools: [{ name: 'echo', inputSchema: {} }] } },
  attachments: DEFAULT_ATTACHMENTS,
}
const binding = connectorToolBindings(features, ['echo'])[0]!
function fixture(execute: ReturnType<typeof vi.fn>) {
  let state = {
    ...createWorkspace('chat'),
    overlay: 'chat-tools',
    chatPreferences: { atomic_connectors: ['echo'] },
    workspace: { features },
    messages: [
      {
        role: 'assistant',
        content: '',
        tool_calls: ['one', 'two'].map((id) => ({
          id,
          type: 'function',
          function: { name: binding.name, arguments: '{}' },
        })),
      },
    ],
  } as unknown as WorkspaceState
  const send = vi.fn(),
    ctx = {
      get: () => state,
      update: (fn: (s: WorkspaceState) => WorkspaceState) => {
        state = fn(state)
      },
      controller: { runtime: { execute } },
      send,
    } as unknown as ActionContext
  return { ctx, send, state: () => state }
}
it('records every approved result including failures so successful side effects are never repeated', async () => {
  const execute = vi.fn().mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error('offline'))
  const f = fixture(execute)
  await chatFeatureAction('chat-tools-approve', f.ctx)
  expect(execute).toHaveBeenCalledTimes(2)
  expect(pendingToolCalls(f.state().messages)).toEqual([])
  expect(f.state().messages.at(-1)?.content).toContain('offline')
  await chatFeatureAction('chat-tools-approve', f.ctx)
  expect(execute).toHaveBeenCalledTimes(2)
})
it('Escape closes tool review with declined results without executing tools or starting another request', async () => {
  const execute = vi.fn(),
    f = fixture(execute)
  await chatFeatureAction('close', f.ctx)
  expect(f.state().overlay).toBeNull()
  expect(pendingToolCalls(f.state().messages)).toEqual([])
  expect(execute).not.toHaveBeenCalled()
  expect(f.send).not.toHaveBeenCalled()
})
