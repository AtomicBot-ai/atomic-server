import { randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChatMessage } from '../terminal-service/index.js'
import { readDocument, mutateDocument } from './store.js'
export interface Conversation {
  id: string
  title: string
  endpoint: string
  model: string
  workingDirectory: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  interrupted: boolean
  archived?: boolean
  request_settings?: Record<string, unknown>
}
export type ConversationSummary = Omit<Conversation, 'messages'> & { turns: number }
export class ChatHistory {
  private directory: string
  constructor(directory: string) {
    this.directory = join(directory, 'chats')
  }
  create(endpoint: string, model: string, workingDirectory: string): Conversation {
    const now = Date.now()
    return {
      id: randomUUID(),
      title: 'New chat',
      endpoint,
      model,
      workingDirectory,
      createdAt: now,
      updatedAt: now,
      messages: [],
      interrupted: false,
    }
  }
  async save(chat: Conversation): Promise<void> {
    await mutateDocument<Conversation | null>(this.path(chat.id), null, (previous) => ({
      ...chat,
      updatedAt:
        previous && JSON.stringify(previous.messages) === JSON.stringify(chat.messages)
          ? previous.updatedAt
          : Date.now(),
    }))
  }
  async load(id: string): Promise<Conversation | null> {
    return readDocument(this.path(id), null)
  }
  async list(): Promise<ConversationSummary[]> {
    const files = await readdir(this.directory).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return []
      throw e
    })
    const chats = await Promise.all(
      files
        .filter((f) => /^[\da-f-]{36}\.json$/.test(f))
        .map(async (f) => {
          const c = await this.load(f.slice(0, -5))
          if (!c) return null
          const { messages, ...summary } = c
          return { ...summary, turns: messages.filter((m) => m.role === 'user').length }
        })
    )
    return chats.filter((c): c is ConversationSummary => c !== null).sort((a, b) => b.updatedAt - a.updatedAt)
  }
  async remove(id: string): Promise<void> {
    await rm(this.path(id), { force: true })
  }
  private path(id: string) {
    if (!/^[\da-f-]{36}$/.test(id)) throw new Error('Invalid conversation ID.')
    return join(this.directory, `${id}.json`)
  }
}
