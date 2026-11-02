/** A recorded commit alone is insufficient when an old job omitted shard metadata. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ModelSetup, ModelSetupPlan } from '../../contract/index.js'
import type { Downloader } from '../../downloads/index.js'
import { fixture, cleanup } from '../../../test/helpers/model-setups-fixture.js'
import { runSetup } from './model-setup-run.js'

afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
it('refuses an incomplete legacy shard set before transfer and keeps partial bytes', async () => {
  const f = fixture()
  await mkdir(f.tmp.paths.dataFolder, { recursive: true })
  const partial = join(f.tmp.paths.dataFolder, 'kept.tmp')
  await writeFile(partial, 'partial bytes')
  const model = { repo: 'owner/repo', file: 'm-00001-of-00002.gguf', revision: 'a'.repeat(40), size: 4 }
  const plan = { model, model_files: [model], projector: null } as ModelSetupPlan
  const downloader = { download: vi.fn(), cancel: vi.fn() }
  await expect(
    runSetup(
      { link: f.link, paths: f.tmp.paths, env: {}, downloader: downloader as unknown as Downloader },
      { plan, task_ids: { model: 'old' } } as ModelSetup,
      new AbortController().signal,
      async () => {},
      async () => {}
    )
  ).rejects.toThrow('no complete model plan')
  expect(downloader.download).not.toHaveBeenCalled()
  expect(await readFile(partial, 'utf8')).toBe('partial bytes')
})
