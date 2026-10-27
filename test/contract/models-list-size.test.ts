/** `atc models list` shows a model's size on disk: the registry records it, the row carried it nowhere. */
import { afterEach, expect, it } from 'vitest'
import { ModelRegistry } from '@atomic-chat/core/models'
import { atcPathsFor } from '../../src/config/index.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())

it('lists a GGUF model with its size and its repository', async () => {
  t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
  await new ModelRegistry(paths.layout).write('LiquidAI/LFM2-1.2B-Q4_K_M', {
    model_path: 'llamacpp/models/LiquidAI/LFM2-1.2B-Q4_K_M/LFM2-1.2B-Q4_K_M.gguf',
    name: 'LFM2-1.2B-Q4_K_M',
    size_bytes: 730_893_248,
    repository: 'LiquidAI/LFM2-1.2B-GGUF',
  })
  expect(await t.run(['models', 'list'])).toBe(0)
  const line = t.io.out
    .join('')
    .split('\n')
    .find((l) => l.startsWith('LiquidAI/LFM2-1.2B-Q4_K_M'))
  expect(line).toMatch(/697\.0 MiB$/)
  t.io.out.length = 0
  expect(await t.run(['models', 'list', '--json'])).toBe(0)
  const row = (JSON.parse(t.io.out.join('')).result as Array<Record<string, unknown>>).find(
    (m) => m['id'] === 'LiquidAI/LFM2-1.2B-Q4_K_M'
  )
  expect(row).toMatchObject({ size_bytes: 730_893_248, repository: 'LiquidAI/LFM2-1.2B-GGUF' })
})
