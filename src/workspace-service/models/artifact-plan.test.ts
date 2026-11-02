import { describe, expect, it } from 'vitest'
import { artifactPlan } from './artifact-plan.js'
import type { CatalogRow } from './catalog.js'
import { AtcError } from '../../errors/index.js'

const modelRevision = 'a'.repeat(40)
const vaeRevision = 'b'.repeat(40)
function row(): CatalogRow {
  return {
    id: 'z-image',
    name: 'Z-Image Turbo',
    category: 'image',
    description: '',
    source: {
      transformer: {
        repo: 'unsloth/Z-Image-Turbo-GGUF',
        revision: modelRevision,
        quants: [{ id: 'q4', filename: 'model.gguf', bytes: 10 }],
      },
      vae: { repo: 'owner/vae', revision: vaeRevision, filename: 'vae.safetensors', bytes: 20 },
      text_encoders: [{ repo: 'owner/encoder', filename: 'encoder.gguf', bytes: 30, field: 'llm' }],
    },
  }
}

describe('diffusion catalog revisions', () => {
  it('pins each repository independently and keeps main for unpinned files', () => {
    const plan = artifactPlan(row(), '/data')
    expect(plan.files.map((file) => file.url)).toEqual([
      `https://huggingface.co/unsloth/Z-Image-Turbo-GGUF/resolve/${modelRevision}/model.gguf`,
      `https://huggingface.co/owner/vae/resolve/${vaeRevision}/vae.safetensors`,
      'https://huggingface.co/owner/encoder/resolve/main/encoder.gguf',
    ])
    const changed = row()
    ;(changed.source['transformer'] as Record<string, unknown>)['revision'] = 'c'.repeat(40)
    expect(artifactPlan(changed, '/data').digest).not.toBe(plan.digest)
  })

  it.each(['main', '../main', '', 'a'.repeat(39), 123, null])(
    'rejects malformed transformer revision %j',
    (revision) => {
      const input = row()
      ;(input.source['transformer'] as Record<string, unknown>)['revision'] = revision
      expect(() => artifactPlan(input, '/data')).toThrow('Invalid catalog revision')
    }
  )

  it('rejects malformed side-file revisions', () => {
    const input = row()
    ;(input.source['vae'] as Record<string, unknown>)['revision'] = 'main'
    expect(() => artifactPlan(input, '/data')).toThrow('Invalid catalog revision')
  })
})

describe.each(['image', 'video'] as const)('%s quantization selection', (category) => {
  const family = (quants: unknown) => {
    const input = row()
    input.category = category
    ;(input.source['transformer'] as Record<string, unknown>)['quants'] = quants
    return input
  }

  it('refuses an unavailable explicit choice as usage instead of choosing another file', () => {
    const input = family([{ id: 'q4', filename: 'model.gguf', bytes: 10 }])
    expect(() => artifactPlan(input, '/data', 'unavailable')).toThrow(
      new AtcError('ATC_USAGE', 'Choose an available quantization.')
    )
    try {
      artifactPlan(input, '/data', 'unavailable')
    } catch (error) {
      expect(error).toBeInstanceOf(AtcError)
      expect(error).toMatchObject({ code: 'ATC_USAGE' })
    }
  })

  it.each([[], undefined, null, {}].map((quants) => ({ quants })))(
    'keeps invalid catalog quants $quants as a catalog failure',
    ({ quants }) => {
      try {
        artifactPlan(family(quants), '/data', 'unavailable')
        expect.fail('A catalog without quantizations must fail.')
      } catch (error) {
        expect(error).not.toBeInstanceOf(AtcError)
        expect(error).toMatchObject({ message: 'This catalog family has no downloadable quantization.' })
      }
    }
  )

  it('preserves explicit, recommended and first-entry selection', () => {
    const input = family([
      { id: 'q4', filename: 'model-q4.gguf', bytes: 10 },
      { id: 'q8', filename: 'model-q8.gguf', bytes: 20, recommended: true },
    ])
    expect(artifactPlan(input, '/data', 'q4').files[0]?.url).toContain('/model-q4.gguf')
    expect(artifactPlan(input, '/data').model_id).toBe('z-image:q8')
    delete (
      (input.source['transformer'] as Record<string, unknown>)['quants'] as Record<string, unknown>[]
    )[1]!['recommended']
    expect(artifactPlan(input, '/data').model_id).toBe('z-image:q4')
  })
})
