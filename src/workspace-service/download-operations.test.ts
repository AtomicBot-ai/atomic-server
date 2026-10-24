import { describe, expect, it, vi } from 'vitest'
import { downloadOperation } from './download-operations.js'
import { NOT_CORE } from './not-core.js'

function parts() {
  const setups = { operation: vi.fn(async () => 'setup') }
  const artifacts = { list: vi.fn(async () => ['artifact']), cancel: vi.fn(async () => 'cancelled') }
  const engines = { enqueue: vi.fn(async () => 'queued'), retry: vi.fn(async () => 'retried') }
  return {
    setups,
    artifacts,
    engines,
    parts: { downloads: { setups, artifacts }, engines, options: {}, snapshot: async () => ({}) } as never,
  }
}

describe('download operations', () => {
  it.each([
    ['engines.enqueue', { engine: 'llamacpp' }, 'queued'],
    ['engines.retry', { id: 'e1' }, 'retried'],
    ['setup.resume', { setup_id: 's1' }, 'setup'],
    ['artifacts.list', {}, ['artifact']],
    ['artifacts.cancel', { id: 'a1' }, 'cancelled'],
  ])('routes %s to its owner', async (operation, input, answer) => {
    expect(await downloadOperation(parts().parts, operation, input)).toEqual(answer)
  })

  it('leaves any other operation to the next owner', () => {
    expect(downloadOperation(parts().parts, 'models.load', {})).toBe(NOT_CORE)
  })
})
