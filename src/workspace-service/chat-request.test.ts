import { describe, expect, it } from 'vitest'
import { chatRequestFor, contextExceeded } from './chat-request.js'

const llamaKnobs = { repeat_penalty: 1.1, n_predict: 64, cache_prompt: true, reasoning_format: 'auto', n: 1 }
const tools = [{ type: 'function', function: { name: 'f', parameters: {} } }]
const body = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
  stream: true,
  stream_options: { include_usage: true },
  temperature: 0.7,
  top_k: 40,
  min_p: 0.05,
  chat_template_kwargs: { enable_thinking: false },
  ...llamaKnobs,
}

describe('chatRequestFor', () => {
  it('cuts a managed engine’s body to the OpenAI fields every managed engine reads', () => {
    expect(
      chatRequestFor('vllm', { ...body, tools: [], tool_choice: 'auto', response_format: { type: 'text' } })
    ).toEqual({
      model: 'm',
      messages: body.messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      top_k: 40,
      min_p: 0.05,
      chat_template_kwargs: { enable_thinking: false },
    })
  })

  it('keeps tools, tool_choice with them, and a structured response_format for a managed engine', () => {
    const shaped = chatRequestFor('tensorrt-llm', {
      ...body,
      tools,
      tool_choice: 'auto',
      response_format: { type: 'json_object' },
    })
    expect(shaped).toMatchObject({ tools, tool_choice: 'auto', response_format: { type: 'json_object' } })
  })

  it('cuts a Foundry Local body further: no top_k, min_p, chat_template_kwargs or response_format', () => {
    const shaped = chatRequestFor('foundry-local', {
      ...body,
      tools,
      response_format: { type: 'json_object' },
    })
    expect(Object.keys(shaped).sort()).toEqual([
      'messages',
      'model',
      'stream',
      'stream_options',
      'temperature',
      'tools',
    ])
  })

  it('offers a Foundry Local model tools only when its model.yml says it takes them', () => {
    const shaped = chatRequestFor('foundry-local', { ...body, tools, tool_choice: 'auto' }, { tools: false })
    expect(shaped).not.toHaveProperty('tools')
    expect(shaped).not.toHaveProperty('tool_choice')
  })

  it('leaves a llama.cpp body as it is', () => {
    expect(chatRequestFor('llamacpp-upstream', body)).toEqual(body)
  })

  it.each(['sglang', 'foundry-local'])('refuses images for %s', (provider) => {
    const image = {
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }],
    }
    expect(() => chatRequestFor(provider, { ...body, messages: [image] })).toThrow('images')
  })
})

describe('chatRequestFor, LiteRT-LM', () => {
  it('passes what its host reads and drops llama.cpp’s knobs', () => {
    const shaped = chatRequestFor('litert-lm', {
      ...body,
      seed: 1,
      reasoning_effort: 'none',
      response_format: { type: 'json_object' },
    })
    expect(Object.keys(shaped).sort()).toEqual([
      'chat_template_kwargs',
      'messages',
      'model',
      'n',
      'reasoning_effort',
      'response_format',
      'seed',
      'stream',
      'stream_options',
      'temperature',
      'top_k',
    ])
  })

  it('offers tools only when model.yml says the model takes them, with tool_choice auto or none', () => {
    expect(chatRequestFor('litert-lm', { ...body, tools }, { tools: false })).not.toHaveProperty('tools')
    expect(
      chatRequestFor('litert-lm', { ...body, tools, tool_choice: 'auto' }, { tools: true })
    ).toMatchObject({
      tools,
      tool_choice: 'auto',
    })
    const named = { type: 'function', function: { name: 'f' } }
    expect(
      chatRequestFor('litert-lm', { ...body, tools, tool_choice: named }, { tools: true })
    ).not.toHaveProperty('tool_choice')
  })

  it('takes an image only for a model with vision', () => {
    const image = {
      ...body,
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } }] },
      ],
    }
    expect(() => chatRequestFor('litert-lm', image, { vision: false })).toThrow(/takes no images/)
    expect(chatRequestFor('litert-lm', image, { vision: true })['messages']).toEqual(image.messages)
  })
})

describe('contextExceeded', () => {
  it('turns the engine’s refusal into the limit, the request length and the setting to change', () => {
    const error = contextExceeded(
      'tensorrt-llm',
      "This model's maximum context length is 4096 tokens. However, you requested 5120 tokens (4608 in the messages, 512 in the completion)."
    )
    expect(error?.message).toContain('4096')
    expect(error?.message).toContain('5120')
    expect(error?.hint).toContain('atc config set engine.tensorrt-llm.context_length')
  })

  it.each([
    [
      'vllm',
      "This model's maximum context length is 4096 tokens, but the request has 5120 tokens. Shorten the conversation or the requested output.",
    ],
    [
      'sglang',
      "This model's maximum context length is 4096 tokens, but the request has 5120 tokens. Shorten the conversation or the requested output.",
    ],
    [
      'tensorrt-llm',
      "This model's maximum context length is 4096 tokens. However, your messages resulted in 5120 tokens. Please reduce the length of the messages.",
    ],
  ])('reads the request length from the core’s wording for %s', (provider, message) => {
    expect(contextExceeded(provider, message)?.message).toContain('(5120 tokens)')
  })

  it('reads the error code too, and leaves other errors alone', () => {
    expect(contextExceeded('vllm', 'context_length_exceeded: prompt too long')?.hint).toContain(
      'engine.vllm.context_length'
    )
    expect(contextExceeded('vllm', 'CUDA out of memory')).toBeUndefined()
    expect(contextExceeded('llamacpp-upstream', 'maximum context length is 4096 tokens')).toBeUndefined()
  })
})

describe('an engine’s own error shape', () => {
  it('reads the message of `{"object":"error","message":…}` in a failed stream', async () => {
    const { readChatStream } = await import('./chat-stream.js')
    const response = Response.json(
      { object: 'error', message: "This model's maximum context length is 4096 tokens.", code: 400 },
      { status: 400 }
    )
    await expect(readChatStream(response, () => {})).rejects.toThrow('maximum context length is 4096')
  })
})
