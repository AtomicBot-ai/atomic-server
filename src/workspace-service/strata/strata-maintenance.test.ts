import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ModelRegistry, serializeModelYml } from '@atomic-chat/core/models'
import { parseStrataDescriptor, strataSourceDigest } from '@atomic-chat/core/client'
import { expect, it, vi } from 'vitest'
import excerpt from '../../../test/fixtures/strata/catalog.json' with { type: 'json' }
import { defaultConfig } from '../../config/index.js'
import { writeDocument } from '../../terminal-data/index.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { STRATA_OWNED_FILE, StrataMaintenance } from './maintenance.js'
import { StrataPreparationFailed } from './preparation.js'

it('keeps the guard and backup on an uncertain core response, then restores the previous installation on a confirmed failure', async () => {
  const { paths, cleanup } = tmpDataFolder()
  try {
    const link = fakeCoreLink()
    const old = parseStrataDescriptor(excerpt.models['strata-qwen38-iq3-xxs'].definition)
    const next = { ...old, name: old.name + ' updated' }
    const model = old.variant_id
    const original = await strataSourceDigest(old)
    const digest = await strataSourceDigest(next)
    const modelPath = `strata/models/${model}/${old.inputs.weights[0]!}`
    const root = paths.layout.provider('strata')
    const target = join(root.modelsDir, model)
    const stage = join(root.root, 'fixture-stage')
    const backup = join(root.root, 'recovery', model)
    const registry = new ModelRegistry(paths.layout, 'strata')
    await registry.write(model, {
      model_path: modelPath,
      strata: { schema_version: 1, descriptor: old, source_digest: original },
    })
    await writeDocument(join(target, STRATA_OWNED_FILE), { model_id: model })
    await writeFile(join(target, 'previous'), 'old')
    await mkdir(stage, { recursive: true })
    await writeDocument(join(stage, STRATA_OWNED_FILE), { model_id: model })
    // core-boundary: model.yml — the staged registration for the replacement fixture
    await writeFile(
      join(stage, 'model.yml'),
      serializeModelYml({
        model_path: modelPath,
        strata: { schema_version: 1, descriptor: next, source_digest: digest },
      })
    )
    link.responses['POST /models/strata/maintenance'] = {
      operation_id: 'guard-1',
      state: 'held',
      ready_to_mutate: true,
    }
    const complete = vi.fn(async () => {
      expect(await readFile(join(target, 'previous'), 'utf8')).toBe('old')
      return { state: 'completed' }
    })
    link.responses['POST /models/strata/maintenance/guard-1/complete'] = complete
    const options = { link, paths, config: defaultConfig() }
    const attempt = new StrataMaintenance(options)
    await expect(
      attempt.replaceIfNeeded(model, 'job', digest, stage, true, async (id) => {
        expect(id).toBe('guard-1')
        throw new Error('Control connection lost')
      })
    ).rejects.toThrow('Control connection lost')
    await expect(readFile(join(backup, 'previous'), 'utf8')).resolves.toBe('old')
    expect(complete).not.toHaveBeenCalled()
    await expect(
      new StrataMaintenance(options).replaceIfNeeded(model, 'job', digest, stage, false, async () => {
        throw new StrataPreparationFailed('Preparation failed')
      })
    ).rejects.toThrow('Preparation failed')
    expect(complete).toHaveBeenCalledOnce()
    expect(await attempt.pending(model)).toBe(false)
    const requests = link.calls.filter(({ path }) => path === '/models/strata/maintenance')
    expect(requests).toHaveLength(2)
    expect(requests[0]?.body).toEqual(requests[1]?.body)
  } finally {
    cleanup()
  }
})
