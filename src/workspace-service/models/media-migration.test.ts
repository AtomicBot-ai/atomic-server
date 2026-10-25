import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

async function put(path: string, text = 'x') {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}

/** A media job as an earlier atc wrote it: files under workspace-models/<category>/<family>. */
function job(data: string, category: string, family: string) {
  const rel = `workspace-models/${category}/${family}/transformer/m.gguf`
  return {
    id: `job-${family}`,
    stage: 'ready',
    updated_at: 0,
    plan: {
      digest: `digest-${family}`,
      category,
      model_id: `${family}:q4`,
      files: [{ url: 'https://huggingface.co/o/r/resolve/main/m.gguf', save_path: rel }],
      load: { files: { diffusionModel: join(data, ...rel.split('/')) } },
    },
  }
}

describe('media folders from an earlier atc', () => {
  // The core lists, loads and deletes diffusion files under `diffusion/models` only.
  it('move to diffusion/models on start, partials and records included', async () => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const data = tmp.paths.dataFolder,
      records = join(tmp.paths.atcDir, 'media-installations')
    await put(join(data, 'workspace-models/video/fam/transformer/m.gguf'), 'weights')
    await put(join(data, 'workspace-models/video/fam/clipL/c.gguf.tmp'), 'part')
    await put(join(data, 'workspace-models/video/fam/clipL/c.gguf.url'), 'https://x')
    await put(join(data, 'workspace-models/embedding/emb/model.gguf'))
    // A family the destination already has stays where it is, with its records unchanged.
    await put(join(data, 'workspace-models/image/taken/transformer/m.gguf'), 'old')
    await put(join(data, 'diffusion/models/taken/other.gguf'), 'someone else')
    await put(join(records, 'job-fam.json'), JSON.stringify(job(data, 'video', 'fam')))
    await put(join(records, 'digest-fam.json'), JSON.stringify(job(data, 'video', 'fam').plan))
    await put(join(records, 'job-taken.json'), JSON.stringify(job(data, 'image', 'taken')))

    const service = new WorkspaceService({ paths: tmp.paths, link: fakeCoreLink(), config: defaultConfig() })
    // The family the destination already had is named, so the log can say why it stayed.
    expect(await service.start()).toEqual({ kept: ['image/taken'] })

    expect(await readFile(join(data, 'diffusion/models/fam/transformer/m.gguf'), 'utf8')).toBe('weights')
    expect(existsSync(join(data, 'diffusion/models/fam/clipL/c.gguf.tmp'))).toBe(true)
    expect(existsSync(join(data, 'diffusion/models/fam/clipL/c.gguf.url'))).toBe(true)
    expect(existsSync(join(data, 'workspace-models/video'))).toBe(false)
    expect(existsSync(join(data, 'workspace-models/embedding/emb/model.gguf'))).toBe(true)
    expect(existsSync(join(data, 'workspace-models/image/taken/transformer/m.gguf'))).toBe(true)

    const moved = JSON.parse(await readFile(join(records, 'job-fam.json'), 'utf8'))
    expect(moved.plan.files[0].save_path).toBe('diffusion/models/fam/transformer/m.gguf')
    expect(moved.plan.load.files.diffusionModel).toBe(
      join(data, 'diffusion', 'models', 'fam', 'transformer', 'm.gguf')
    )
    const plan = JSON.parse(await readFile(join(records, 'digest-fam.json'), 'utf8'))
    expect(plan.files[0].save_path).toBe('diffusion/models/fam/transformer/m.gguf')
    const kept = JSON.parse(await readFile(join(records, 'job-taken.json'), 'utf8'))
    expect(kept.plan.files[0].save_path).toBe('workspace-models/image/taken/transformer/m.gguf')

    // A second start finds nothing left to move.
    await service.start()
    expect(await readFile(join(data, 'diffusion/models/fam/transformer/m.gguf'), 'utf8')).toBe('weights')
  })
})
