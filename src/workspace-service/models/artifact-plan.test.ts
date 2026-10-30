import { describe, expect, it } from 'vitest'
import { artifactPlan } from './artifact-plan.js'
import type { CatalogRow } from './catalog.js'

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
