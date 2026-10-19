import { randomUUID } from 'node:crypto'
import type { WorkspaceInput } from '../contract/index.js'
import type { ChatHistory, ClientKeys, Conversation } from '../terminal-data/index.js'
import { AtcError } from '../errors/index.js'
import type { WorkspaceServiceOptions } from './service.js'
import { object } from './validation.js'
import { publicEndpoint } from './snapshot.js'
import { mergeChatDelta, readChatStream } from './chat-stream.js'

interface Job {
  id: string
  conversation_id: string
  state: 'preparing' | 'generating' | 'stopping' | 'complete' | 'stopped' | 'failed'
  message: Record<string, unknown>
  usage?: unknown
  error?: string
  model: string
  provider: string
  started_at: number
  duration_ms: number
  first_token_ms?: number
  finish_reason?: string
}
interface Running {
  view: Job
  controller: AbortController
  lastRead: number
}

/** Owned by the server, accessible through the same authenticated operations as the CLI. */
export class ChatJobs {
  private jobs = new Map<string, Running>()
  constructor(
    private options: WorkspaceServiceOptions,
    private keys: ClientKeys,
    private history: ChatHistory
  ) {}
  async start(input: WorkspaceInput) {
    for (const [id, job] of this.jobs)
      if (!this.active(job.view) && Date.now() - job.lastRead > 300000) this.jobs.delete(id)
    if ([...this.jobs.values()].filter((job) => this.active(job.view)).length >= 4)
      throw new AtcError('ATC_USAGE', 'Four Playground requests are already active. Stop one first.')
    if (this.jobs.size >= 64) {
      const oldest = [...this.jobs].find(([, job]) => !this.active(job.view))
      if (oldest) this.jobs.delete(oldest[0])
    }
    const request = object(input['request']),
      model = String(request['model'] ?? '')
    if (!model || !Array.isArray(request['messages']) || !request['messages'].length)
      throw new AtcError('ATC_USAGE', 'Choose a ready model and provide messages.')
    const sessions = (await this.options.link.models.sessions()).filter((s) => s.model_id === model)
    if (sessions.length !== 1 || (input['provider'] && sessions[0]?.provider !== input['provider']))
      throw new AtcError(
        'ATC_USAGE',
        sessions.length > 1
          ? 'This model ID is loaded in multiple engines. Unload the other instance before testing this endpoint.'
          : 'Load the selected model in Engines & Models, then retry.'
      )
    const status = await this.options.link.server.status()
    if (!status.running) throw new AtcError('ATC_USAGE', 'Start the API on the Server page, then retry.')
    const endpoint = publicEndpoint(object(status), this.options.config).endpoint
    let chat = input['conversation_id'] ? await this.history.load(String(input['conversation_id'])) : null
    if (
      chat &&
      [...this.jobs.values()].some((j) => this.active(j.view) && j.view.conversation_id === chat?.id)
    )
      throw new AtcError('ATC_USAGE', 'This conversation already has an active request.')
    chat ??= this.history.create(endpoint, model, '')
    const previous = chat.messages as unknown as Record<string, unknown>[]
    chat.messages = (request['messages'] as Record<string, unknown>[]).map((message, index) => {
      const { atomic_meta: meta, ...wire } = previous[index] ?? {}
      return JSON.stringify(wire) === JSON.stringify(message) && meta
        ? { ...message, atomic_meta: meta }
        : message
    }) as unknown as Conversation['messages']
    if (chat.title === 'New chat') {
      const first = object(chat.messages.find((m) => m.role === 'user'))['content']
      chat.title = typeof first === 'string' ? first.slice(0, 70) : 'Attachment conversation'
    }
    chat.model = model
    const {
      model: _model,
      messages: _messages,
      stream: _stream,
      stream_options: _streamOptions,
      ...parameters
    } = request
    chat.request_settings = parameters
    chat.interrupted = true
    await this.history.save(chat)
    const job: Running = {
      view: {
        id: randomUUID(),
        conversation_id: chat.id,
        state: 'preparing',
        message: { role: 'assistant', content: '' },
        model,
        provider: String(sessions[0]!.provider),
        started_at: Date.now(),
        duration_ms: 0,
      },
      controller: new AbortController(),
      lastRead: Date.now(),
    }
    this.jobs.set(job.view.id, job)
    void this.run(job, chat, endpoint, request)
    return structuredClone(job.view)
  }
  get(id: string) {
    const job = this.find(id)
    job.lastRead = Date.now()
    return structuredClone(job.view)
  }
  cancel(id: string) {
    const job = this.find(id)
    if (this.active(job.view)) {
      job.view.state = 'stopping'
      job.controller.abort()
    }
    return structuredClone(job.view)
  }
  private find(id: string) {
    const job = this.jobs.get(id)
    if (!job)
      throw new AtcError(
        'ATC_USAGE',
        'This request expired or the server restarted. Reopen the saved conversation.'
      )
    return job
  }
  private active(job: Job) {
    return ['preparing', 'generating', 'stopping'].includes(job.state)
  }
  private async run(job: Running, chat: Conversation, endpoint: string, request: Record<string, unknown>) {
    const view = job.view
    // A disconnected browser must not leave an unattended generation consuming memory indefinitely.
    const lease = setInterval(() => {
      if (Date.now() - job.lastRead > 60000) job.controller.abort()
    }, 10000)
    let state: Job['state'] = 'complete'
    try {
      const key = await this.keys.get()
      const response = await (this.options.fetch ?? fetch)(`${endpoint}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.any([job.controller.signal, AbortSignal.timeout(600000)]),
        body: JSON.stringify({ ...request, stream: true, stream_options: { include_usage: true }, n: 1 }),
      })
      await readChatStream(response, (chunk) => {
        const choice = object((chunk['choices'] as unknown[] | undefined)?.[0]),
          delta = object(choice['delta'])
        if (delta['content'] || delta['reasoning_content'] || delta['tool_calls']) {
          view.first_token_ms ??= Date.now() - view.started_at
          if (view.state !== 'stopping') view.state = 'generating'
          mergeChatDelta(view.message, delta)
        }
        if (chunk['usage']) view.usage = chunk['usage']
        if (choice['finish_reason']) view.finish_reason = String(choice['finish_reason'])
        view.duration_ms = Date.now() - view.started_at
      })
      if (job.controller.signal.aborted) state = 'stopped'
    } catch (error) {
      state = job.controller.signal.aborted ? 'stopped' : 'failed'
      if (state === 'failed') view.error = error instanceof Error ? error.message : String(error)
    } finally {
      clearInterval(lease)
      view.duration_ms = Date.now() - view.started_at
      view.message['atomic_meta'] = {
        model: view.model,
        provider: view.provider,
        usage: view.usage,
        duration_ms: view.duration_ms,
        first_token_ms: view.first_token_ms,
        state,
        finish_reason: view.finish_reason,
      }
      chat.messages.push(view.message as unknown as Conversation['messages'][number])
      chat.interrupted = state !== 'complete'
      try {
        await this.history.save(chat)
      } catch {
        view.error = 'The answer could not be saved. Export it before leaving this page.'
        state = 'failed'
      }
      view.state = state
    }
  }
}
