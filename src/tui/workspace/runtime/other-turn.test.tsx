import { render, Text } from 'ink'
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { fakeTerminal } from '../../../../test/helpers/fake-terminal.js'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import type { Conversation } from '../../../terminal-data/index.js'
import type { WorkspaceController } from '../controller.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { markSynced } from '../chat/live-conversation.js'
import { useOtherTurn } from './other-turn.js'

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

const chat: Conversation = {
  id: 'c1',
  title: 'Shared',
  endpoint: '',
  model: 'm',
  workingDirectory: '',
  createdAt: 1,
  updatedAt: 1,
  messages: [{ role: 'user', content: 'Reply with LIVE-99.' }],
  interrupted: false,
}

async function mount(state: WorkspaceState, controller: WorkspaceController) {
  const latest = { current: state }
  const ref = { current: controller }
  function Probe() {
    useOtherTurn(latest.current, latest, ref, (fn) => {
      latest.current = fn(latest.current)
    })
    return <Text>Playground</Text>
  }
  const terminal = fakeTerminal()
  let ui!: ReturnType<typeof render>
  await act(async () => {
    ui = render(<Probe />, { ...terminal.streams, patchConsole: false })
  })
  cleanup.push(async () => {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
  })
  return latest
}

it('streams a reply the Web is generating in the chat open here, then keeps the saved one', async () => {
  const final = [...chat.messages, { role: 'assistant' as const, content: 'LIVE-99 acknowledged' }]
  const progress = [
    {
      id: 'j1',
      conversation_id: 'c1',
      state: 'generating',
      message: { role: 'assistant', content: 'LIVE-99' },
    },
    {
      id: 'j1',
      conversation_id: 'c1',
      state: 'complete',
      message: { role: 'assistant', content: 'LIVE-99 acknowledged' },
    },
  ]
  let step = 0
  const controller = {
    runtime: { read: vi.fn(async () => progress[Math.min(step, 1)]) },
    history: { load: vi.fn(async () => ({ ...chat, messages: final })) },
  } as unknown as WorkspaceController
  markSynced(controller, chat)
  const latest = await mount(
    {
      ...createWorkspace('chat'),
      setupComplete: true,
      conversation: chat,
      messages: chat.messages,
      draft: 'keep me',
      workspace: { chats: [{ id: 'j1', conversation_id: 'c1', state: 'generating' }] } as WorkspaceSnapshot,
    },
    controller
  )
  await vi.waitFor(() => expect(latest.current.otherTurn?.message).toMatchObject({ content: 'LIVE-99' }))
  const frame = workspaceFrame(latest.current, 120, 36, 0)
  expect(frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')).toContain('LIVE-99')
  step = 1
  await vi.waitFor(() => expect(latest.current.messages).toEqual(final))
  expect(latest.current).toMatchObject({ otherTurn: null, draft: 'keep me' })
  expect(controller.runtime.read).toHaveBeenCalledWith('chat.progress', { id: 'j1' })
})

it('does not follow its own turn or a turn in another chat', async () => {
  const read = vi.fn()
  const controller = { runtime: { read }, history: { load: vi.fn() } } as unknown as WorkspaceController
  const workspace = {
    chats: [
      { id: 'mine', conversation_id: 'c1', state: 'generating' },
      { id: 'elsewhere', conversation_id: 'c2', state: 'generating' },
    ],
  } as WorkspaceSnapshot
  await mount(
    { ...createWorkspace('chat'), conversation: chat, messages: chat.messages, generating: true, workspace },
    controller
  )
  await new Promise((resolve) => setTimeout(resolve, 600))
  expect(read).not.toHaveBeenCalled()
})
