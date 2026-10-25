import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mutateDocument, readDocument } from './store.js'
import { AtcError } from '../errors/index.js'
export interface ClientKey {
  id: string
  name: string
  token: string
  createdAt: number
}
export type ClientKeyView = Omit<ClientKey, 'token'> & { preview: string }
interface KeyDocument {
  version: 1
  keys: ClientKey[]
}
export class ClientKeys {
  private seen = false
  readonly path: string
  constructor(directory: string) {
    this.path = join(directory, 'client-keys.json')
    this.seen = existsSync(this.path)
  }
  async initialize(initial = ''): Promise<void> {
    await mutateDocument<KeyDocument>(this.path, { version: 1, keys: [] }, (doc) => {
      if (doc.keys.length) return doc
      return {
        version: 1,
        keys: [
          { id: randomUUID(), name: 'Personal key', token: initial || this.token(), createdAt: Date.now() },
        ],
      }
    })
  }
  /**
   * Make `token` one of the keys, adding it under `name` when it is not there yet. A key handed to
   * `atc api start --api-key` or `ATC_API_KEY` must work, and the core checks the keyring only.
   */
  async ensure(token: string, name: string): Promise<void> {
    if (!/^\S{8,512}$/.test(token))
      throw new AtcError('ATC_USAGE', 'An API key is 8 to 512 characters without spaces.')
    await mutateDocument<KeyDocument>(this.path, { version: 1, keys: [] }, (doc) => {
      if (doc.keys.some((k) => k.token === token)) return doc
      if (doc.keys.length >= 100)
        throw new AtcError('ATC_USAGE', 'Revoke an unused key before creating another.')
      return { ...doc, keys: [...doc.keys, { id: randomUUID(), name, token, createdAt: Date.now() }] }
    })
  }
  async list(): Promise<ClientKeyView[]> {
    return (await this.read()).keys.map(({ token, ...key }) => ({
      ...key,
      preview: `${token.slice(0, 7)}...${token.slice(-4)}`,
    }))
  }
  async create(name: string): Promise<ClientKey> {
    if (!name.trim() || name.trim().length > 48)
      throw new AtcError('ATC_USAGE', 'Use a name between 1 and 48 characters.')
    const key = { id: randomUUID(), name: name.trim(), token: this.token(), createdAt: Date.now() }
    await mutateDocument<KeyDocument>(this.path, { version: 1, keys: [] }, (doc) => {
      if (doc.keys.length >= 100)
        throw new AtcError('ATC_USAGE', 'Revoke an unused key before creating another.')
      return { ...doc, keys: [...doc.keys, key] }
    })
    return key
  }
  async revoke(id: string): Promise<void> {
    await mutateDocument<KeyDocument>(this.path, { version: 1, keys: [] }, (doc) => {
      if (doc.keys.length <= 1)
        throw new AtcError('ATC_USAGE', 'Create a replacement before revoking your last key.')
      return { ...doc, keys: doc.keys.filter((k) => k.id !== id) }
    })
  }
  async get(id?: string): Promise<string> {
    const keys = (await this.read()).keys
    return (id ? keys.find((k) => k.id === id) : keys[0])?.token ?? ''
  }
  /** The daemon samples the host keyring on every request: revoke is immediate, including keep-alive. */
  current(): readonly string[] | undefined {
    try {
      const source = readFileSync(this.path, 'utf8')
      this.seen = true
      const doc = JSON.parse(source) as KeyDocument
      return doc.version === 1 && Array.isArray(doc.keys)
        ? doc.keys.map((k) => k.token).filter((k) => typeof k === 'string' && k.length > 0)
        : []
    } catch (error) {
      return !this.seen && (error as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : []
    }
  }
  private read() {
    return readDocument<KeyDocument>(this.path, { version: 1, keys: [] })
  }
  private token() {
    return `atc_${randomBytes(32).toString('hex')}`
  }
}
