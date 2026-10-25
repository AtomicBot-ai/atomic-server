import { expect, it } from 'vitest'
import type { Key } from 'ink'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { createWorkspace } from '../state.js'
import { dimBackdrop } from '../draw/backdrop.js'

it.each([
  [54, 24],
  [120, 36],
  [180, 56],
])('anchors a scrolling picker above the intact composer at %ix%i', (width, height) => {
  const s = createWorkspace('chat')
  s.overlay = 'model-picker'
  s.models = Array.from({ length: 40 }, (_, i) => `Model ${i}`)
  s.focus = 'model:0'
  s.draft = 'Keep this draft'
  for (let i = 0; i < 25; i++)
    Object.assign(
      s,
      workspaceInput('', { downArrow: true } as Key, s, workspaceFrame(s, width, height, 0)).patch
    )
  const frame = workspaceFrame(s, width, height, 0)
  const underlying = workspaceFrame({ ...s, overlay: null }, width, height, 0)
  const editor = underlying.targets.find((target) => target.id === 'composer')!
  dimBackdrop(underlying)
  expect(s.focus).toBe('model:25')
  expect(frame.targets.some((t) => t.id === s.focus)).toBe(true)
  const row = frame.targets.find((t) => t.id === s.focus)!
  expect(workspaceInput(`[<0;${row.x + 1};${row.y + 1}M`, {} as Key, s, frame).action).toBe('model:25')
  expect(frame.popover!.y + frame.popover!.height).toBeLessThanOrEqual(height - 10)
  expect(frame.cells[editor.y]!.slice(editor.x, editor.x + editor.width)).toEqual(
    underlying.cells[editor.y]!.slice(editor.x, editor.x + editor.width)
  )
  expect(frame.cells.map((r) => r.map((c) => c.char).join('')).join('\n')).toContain('Keep this draft')
  expect(frame.targets.some((t) => t.id === 'send' || t.id === 'new')).toBe(false)
  expect(workspaceInput('[<0;1;1M', {} as Key, s, frame).action).toBe('close')
  expect(workspaceInput('', { escape: true } as Key, s, frame).action).toBe('close')
})

it('offers a store model under each provider that lists it, and a GGUF model once', async () => {
  const { pickerRows } = await import('./picker.js')
  const s = createWorkspace('chat')
  s.overlay = 'model-picker'
  s.installed = [
    { id: 'Qwen/Qwen3.5-2B', name: 'Qwen/Qwen3.5-2B', provider: 'vllm', providers: ['vllm', 'tensorrt-llm'] },
    {
      id: 'gemma',
      name: 'Gemma',
      provider: 'llamacpp-upstream',
      providers: ['llamacpp-upstream', 'llamacpp'],
    },
  ]
  const rows = pickerRows(s).filter((r) => r.id.startsWith('installed:'))
  expect(rows.map((r) => [r.id, r.detail])).toEqual([
    ['installed:0:vllm', 'On this device · vLLM'],
    ['installed:0:tensorrt-llm', 'On this device · TensorRT-LLM'],
    ['installed:1', 'On this device · llama.cpp'],
  ])
})
