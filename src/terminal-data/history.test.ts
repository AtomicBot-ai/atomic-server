import { mkdtemp, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { ChatHistory } from './history.js'
it('restores conversation context across launches, renames, and deletes just the selected chat', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'atc-history-'))
  try {
    const store = new ChatHistory(folder),
      chat = store.create('http://localhost:1337/v1', 'local', '/project')
    chat.messages = [
      { role: 'user', content: 'Remember this context' },
      { role: 'assistant', content: 'Partial response' },
    ]
    chat.title = 'A design question'
    chat.interrupted = true
    await store.save(chat)
    const reopened = new ChatHistory(folder)
    expect(await reopened.load(chat.id)).toMatchObject({ ...chat, updatedAt: expect.any(Number) })
    expect(await reopened.list()).toMatchObject([
      { title: 'A design question', turns: 1, interrupted: true, workingDirectory: '/project' },
    ])
    // Windows has no POSIX modes; there the folder's owner-only ACL protects it (host/acl.ts).
    if (process.platform !== 'win32')
      expect((await stat(join(folder, 'chats', chat.id + '.json'))).mode & 0o777).toBe(0o600)
    await reopened.save({ ...chat, title: 'Renamed' })
    expect((await reopened.load(chat.id))?.title).toBe('Renamed')
    await reopened.remove(chat.id)
    expect(await reopened.list()).toEqual([])
    await expect(reopened.load('../../outside')).rejects.toThrow('Invalid conversation ID')
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})

it('orders chats by message activity across selection, rename, streaming and restart', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'atc-history-order-'))
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
  try {
    const store = new ChatHistory(folder)
    const older = store.create('http://localhost:1337/v1', 'local', '/project')
    older.messages = [{ role: 'user', content: 'Earlier question' }]
    await store.save(older)
    clock.mockReturnValue(2000)
    const recent = store.create(older.endpoint, older.model, older.workingDirectory)
    recent.messages = [{ role: 'user', content: 'Latest question' }]
    await store.save(recent)
    clock.mockReturnValue(3000)
    const reopened = new ChatHistory(folder)
    const selected = (await reopened.load(older.id))!
    await reopened.save(selected)
    await reopened.save({ ...selected, title: 'Renamed', interrupted: true, model: 'other' })
    expect((await reopened.list()).map((c) => [c.id, c.updatedAt])).toEqual([
      [recent.id, 2000],
      [older.id, 1000],
    ])
    selected.messages.push({ role: 'assistant', content: 'New response' })
    await reopened.save(selected)
    clock.mockReturnValue(4000)
    selected.messages[1]!.content += ' continues'
    await reopened.save(selected)
    clock.mockReturnValue(5000)
    // The UI can still hold the timestamp from when this conversation was opened.
    await reopened.save(selected)
    expect((await new ChatHistory(folder).list()).map((c) => [c.id, c.updatedAt])).toEqual([
      [older.id, 4000],
      [recent.id, 2000],
    ])
  } finally {
    clock.mockRestore()
    await rm(folder, { recursive: true, force: true })
  }
})

it('preserves image content parts through a save and reopen', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'atc-vision-history-'))
  try {
    const history = new ChatHistory(folder),
      chat = history.create('http://localhost:1337/v1', 'vision', '/')
    chat.messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is here?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,cGl4ZWxz' } },
        ],
      },
    ]
    await history.save(chat)
    expect((await new ChatHistory(folder).load(chat.id))?.messages).toEqual(chat.messages)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
