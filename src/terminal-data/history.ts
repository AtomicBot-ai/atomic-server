import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChatMessage } from '../terminal-service/index.js'
import { readDocument, mutateDocument } from './store.js'
import { AtcError } from '../errors/index.js'
export interface Conversation {
  revision?: number
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
  /** Each file's summary by its modification stamp: clients list every few seconds while one is open. */
  private summaries = new Map<string, { stamp: string; summary: ConversationSummary | null }>()
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
  async save(chat: Conversation, expectedRevision?: number): Promise<void> {
    const saved = await mutateDocument<Conversation | null>(this.path(chat.id), null, (previous) => {
      if (previous) {
        const { revision: _oldRevision, updatedAt: _oldTime, ...old } = previous
        const { revision: _revision, updatedAt: _time, ...next } = chat
        if (isDeepStrictEqual(old, next)) return previous
      }
      if (expectedRevision !== undefined && expectedRevision !== (previous?.revision ?? 0))
        throw new AtcError(
          'ATC_USAGE',
          'This conversation changed in another client. Reopen it before retrying; your draft has been kept.'
        )
      return {
        ...chat,
        revision: (previous?.revision ?? 0) + 1,
        updatedAt:
          previous && JSON.stringify(previous.messages) === JSON.stringify(chat.messages)
            ? previous.updatedAt
            : Date.now(),
      }
    })
    Object.assign(chat, { revision: saved!.revision, updatedAt: saved!.updatedAt })
  }
  async load(id: string): Promise<Conversation | null> {
    return readDocument(this.path(id), null)
  }
  async list(): Promise<ConversationSummary[]> {
    const files = await readdir(this.directory).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return []
      throw e
    })
    const ids = files.filter((f) => /^[\da-f-]{36}\.json$/.test(f)).map((f) => f.slice(0, -5))
    for (const id of this.summaries.keys()) if (!ids.includes(id)) this.summaries.delete(id)
    const chats = await Promise.all(ids.map((id) => this.summary(id)))
    return chats.filter((c): c is ConversationSummary => c !== null).sort((a, b) => b.updatedAt - a.updatedAt)
  }
  private async summary(id: string): Promise<ConversationSummary | null> {
    const info = await stat(this.path(id)).catch(() => null)
    if (!info) return null
    const stamp = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`,
      known = this.summaries.get(id)
    if (known?.stamp === stamp) return known.summary && { ...known.summary }
    // One damaged file must not hide every other conversation.
    const c = await this.load(id).catch(() => null)
    let summary: ConversationSummary | null = null
    if (c) {
      const { messages, ...rest } = c
      summary = { ...rest, turns: messages.filter((m) => m.role === 'user').length }
    }
    this.summaries.set(id, { stamp, summary })
    return summary && { ...summary }
  }
  async remove(id: string): Promise<void> {
    await rm(this.path(id), { force: true })
  }
  private path(id: string) {
    if (!/^[\da-f-]{36}$/.test(id)) throw new AtcError('ATC_USAGE', 'Invalid conversation ID.')
    return join(this.directory, `${id}.json`)
  }
}
