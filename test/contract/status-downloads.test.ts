/** `atc status` lists the server's downloads, a store model's among them (spec managed-models-server). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())

describe('atc status and downloads', () => {
  it('shows a store model download with its stage, and gives it in --json', async () => {
    t = testRun()
    const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER'] as string)
    const dir = join(paths.atcDir, 'managed-model-setups')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'm1.json'),
      JSON.stringify({
        id: 'm1',
        kind: 'managed-model',
        stage: 'downloading',
        updated_at: 1,
        plan: { repository: 'Qwen/Qwen3.5-2B', engine: 'vllm', download_bytes: 1000, files: [] },
      })
    )
    expect(await t.run(['status'])).toBe(0)
    expect(t.io.out.join('')).toMatch(/download.*Qwen\/Qwen3\.5-2B.*interrupted/)
    t.io.out.length = 0
    expect(await t.run(['status', '--json'])).toBe(0)
    expect(JSON.parse(t.io.out.join('')).downloads).toEqual([
      expect.objectContaining({ id: 'm1', model: 'Qwen/Qwen3.5-2B', state: 'interrupted' }),
    ])
  })
})
