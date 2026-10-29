import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render, Text } from 'ink'
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { fakeTerminal } from '../../../../test/helpers/fake-terminal.js'
import { ChatHistory } from '../../../terminal-data/index.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { markSynced } from '../chat/live-conversation.js'
import { useSharedPanels } from './shared-panels.js'

const cleanup: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

async function mount(state: WorkspaceState) {
  const folder = await mkdtemp(join(tmpdir(), 'atc-shared-chats-'))
  cleanup.push(() => rm(folder, { recursive: true, force: true }))
  const latest = { current: state }
  const controller = {
    current: {
      history: new ChatHistory(folder),
      runtime: { read: vi.fn() },
    } as unknown as WorkspaceController,
  }
  function Probe() {
    useSharedPanels(true, latest, controller, (fn) => {
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
  // The Web saves through the server into the same history folder.
  return { latest, controller: controller.current, web: new ChatHistory(folder) }
}
const soon = { timeout: 4500 }

it('shows chats and turns another client saves, keeping the draft, and a deletion', async () => {
  const t = await mount({ ...createWorkspace('chat'), setupComplete: true, draft: 'keep me', cursor: 7 })
  const chat = { ...t.web.create('', 'local-model', ''), title: 'From the Web' }
  chat.messages = [
    { role: 'user', content: 'Reply with OK.' },
    { role: 'assistant', content: 'OK from the Web' },
  ]
  await t.web.save(chat)
  await vi.waitFor(() => expect(t.latest.current.history.map((c) => c.title)).toEqual(['From the Web']), soon)
  // Opened here (`history:` marks what it loaded).
  markSynced(t.controller, chat)
  t.latest.current = { ...t.latest.current, conversation: chat, messages: chat.messages }
  const reply = [
    ...chat.messages,
    { role: 'user' as const, content: 'Reply with LIVE-99.' },
    { role: 'assistant' as const, content: 'LIVE-99 acknowledged' },
  ]
  await t.web.save({ ...chat, title: 'Renamed in the Web', messages: reply })
  await vi.waitFor(() => expect(t.latest.current.messages).toEqual(reply), soon)
  expect(t.latest.current).toMatchObject({
    conversation: { id: chat.id, title: 'Renamed in the Web' },
    draft: 'keep me',
    cursor: 7,
    focus: 'composer',
  })
  await t.web.remove(chat.id)
  await vi.waitFor(() => expect(t.latest.current.conversation).toBeNull(), soon)
  expect(t.latest.current).toMatchObject({ messages: [], history: [], draft: 'keep me' })
}, 15000)

it('keeps a reply this terminal has not saved yet over an older saved copy', async () => {
  const t = await mount({ ...createWorkspace('chat'), setupComplete: true })
  const chat = { ...t.web.create('', 'local-model', ''), title: 'Mine' }
  chat.messages = [{ role: 'user', content: 'Question' }]
  await t.web.save(chat)
  markSynced(t.controller, chat)
  const answered = [...chat.messages, { role: 'assistant' as const, content: 'Not saved yet' }]
  t.latest.current = { ...t.latest.current, conversation: chat, messages: answered }
  await vi.waitFor(() => expect(t.latest.current.history).toHaveLength(1), soon)
  await new Promise((resolve) => setTimeout(resolve, 2600))
  expect(t.latest.current.messages).toEqual(answered)
}, 15000)
