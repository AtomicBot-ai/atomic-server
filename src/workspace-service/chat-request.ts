// The field lists are lifted from Atomic-Chat/web-app/src/lib/managed-engine/request.ts and lib/foundry-local/request.ts @ 7cd5613aa; adapted: one function by provider, a structured `response_format` always passed on for the core's gateway to judge, images refused, the context error read.
/**
 * What `atc`'s own chat (the playground, TUI and admin, `chat.complete`) sends to a session, by its
 * provider (design D11). A managed engine refuses unknown fields (`trtllm-serve`) or ignores them
 * (`vllm serve`): the body is cut to the OpenAI fields every managed engine reads. Foundry Local reads
 * only the OpenAI chat fields, and tools only for a model whose `model.yml` says it takes them. Neither
 * takes images. Other providers get the body as it is.
 */

import { AtcError } from '../errors/index.js'
import { isManagedEngine } from './managed-engines.js'

const PROTOCOL = ['model', 'messages', 'stream', 'stream_options']
const OPENAI_SAMPLING = [
  'temperature',
  'top_p',
  'max_tokens',
  'max_completion_tokens',
  'stop',
  'seed',
  'frequency_penalty',
  'presence_penalty',
]
const MANAGED: ReadonlySet<string> = new Set([
  ...PROTOCOL,
  ...OPENAI_SAMPLING,
  'top_k',
  'min_p',
  'chat_template_kwargs',
])
const FOUNDRY: ReadonlySet<string> = new Set([...PROTOCOL, ...OPENAI_SAMPLING])

/** A `response_format` other than plain text: the request asks for constrained output. */
function structured(format: unknown): boolean {
  return (
    format !== null &&
    typeof format === 'object' &&
    !Array.isArray(format) &&
    (format as { type?: unknown }).type !== 'text'
  )
}

function hasImage(messages: unknown): boolean {
  return (
    Array.isArray(messages) &&
    messages.some(
      (m) =>
        Array.isArray((m as { content?: unknown })?.content) &&
        ((m as { content: unknown[] }).content as Array<{ type?: unknown }>).some(
          (p) => p?.type === 'image_url'
        )
    )
  )
}

/** `options.tools`: whether the model takes tools (a Foundry Local model by its `model.yml`). */
export function chatRequestFor(
  provider: string,
  body: Record<string, unknown>,
  options: { tools?: boolean } = {}
): Record<string, unknown> {
  const managed = isManagedEngine(provider)
  if (!managed && provider !== 'foundry-local') return body
  if (hasImage(body['messages']))
    throw new AtcError('ATC_USAGE', `Models on ${provider} take no images; send text only.`)
  const passed = managed ? MANAGED : FOUNDRY
  const shaped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) if (passed.has(key)) shaped[key] = value
  // `tool_choice` only with tools: an engine refuses one without the other.
  if (options.tools !== false && Array.isArray(body['tools']) && body['tools'].length > 0) {
    shaped['tools'] = body['tools']
    if (body['tool_choice'] !== undefined) shaped['tool_choice'] = body['tool_choice']
  }
  // The core's gateway refuses structured output for a family without it, by name: passed on to say so.
  if (managed && structured(body['response_format'])) shaped['response_format'] = body['response_format']
  return shaped
}

/**
 * An engine's "the request is longer than the context" (OpenAI's `context_length_exceeded`, as the core
 * words it for vLLM, SGLang and TensorRT-LLM) as the limit, the request's length and the setting that raises the limit.
 */
export function contextExceeded(provider: string, message: string): AtcError | undefined {
  if (!isManagedEngine(provider) && provider !== 'foundry-local') return undefined
  const limit = /maximum context length is (\d+)/i.exec(message)?.[1]
  if (!limit && !/context_length_exceeded/i.test(message)) return undefined
  // The core's words (vLLM, SGLang: "the request has N tokens"; TensorRT-LLM: "resulted in N tokens"),
  // and an engine's own ("you requested N tokens").
  const requested = /(?:request has|resulted in|requested(?: a total of)?)\s+(\d+)(?: input)? tokens/i.exec(
    message
  )?.[1]
  return new AtcError(
    'ATC_USAGE',
    `The request${requested ? ` (${requested} tokens)` : ''} is longer than ${provider}'s context${limit ? ` (${limit} tokens)` : ''}.`,
    {
      details: message,
      hint: `shorten it, or raise the limit: atc config set engine.${provider}.context_length <tokens>`,
    }
  )
}
