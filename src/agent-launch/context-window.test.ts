import { describe, expect, it } from 'vitest'
import { checkAgentWindow, outputCap, servedWindow } from './context-window.js'

describe('the served context window', () => {
  it.each([
    ['context_length', { data: [{ id: 'm', context_length: 65536 }] }, 65536],
    ["llama-server's meta.n_ctx", { data: [{ id: 'm', meta: { n_ctx: 40960 } }] }, 40960],
    ['a list that names none', { data: [{ id: 'm' }] }, undefined],
    ['another model only', { data: [{ id: 'other', context_length: 8192 }] }, undefined],
    ['zero', { data: [{ id: 'm', context_length: 0 }] }, undefined],
    ['no list', { error: 'down' }, undefined],
  ])('reads %s', (_name, models, expected) => {
    expect(servedWindow(models, 'm')).toBe(expected)
  })

  it('caps a reply at a quarter of the window, and never above 8192', () => {
    expect(outputCap(16384)).toBe(4096)
    expect(outputCap(131072)).toBe(8192)
  })

  it('refuses only a known window below 32K', () => {
    expect(() => checkAgentWindow('Codex', 'm', undefined)).not.toThrow()
    expect(() => checkAgentWindow('Codex', 'm', 32768)).not.toThrow()
    expect(() => checkAgentWindow('Codex', 'm', 32767)).toThrow(
      expect.objectContaining({ code: 'ATC_USAGE', hint: expect.stringContaining('Fit context') })
    )
  })
})
