import { mkdtemp, stat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
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
