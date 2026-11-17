import { expect, it, vi } from 'vitest'
import { artifactMetadata } from './artifact-metadata.js'
import type { ArtifactPlan } from './artifact-plan.js'

const A = 'a'.repeat(40)
const tree = { sha: A, siblings: [{ rfilename: 'weights.gguf', size: 4 }] }
const plan: ArtifactPlan = {
  digest: 'old',
  category: 'audio',
  model_id: 'voice',
  name: 'Voice',
  engine: 'audio-cpp',
  created_at: 1,
  files: [
    {
      url: `https://huggingface.co/a/model/resolve/${A}/weights.gguf`,
      save_path: 'models/weights.gguf',
      size: 4,
    },
  ],
  total_download_bytes: 4,
  load: {},
}

it.each(['', '   ', 'hf-mirror.example'])(
  'ignores a Hub mirror that is not an absolute HTTP URL (%j)',
  async (mirror) => {
    const request = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      // The runtime's fetch parses the URL itself; a relative one fails there, not in atc.
      expect(new URL(String(input)).origin).toBe('https://huggingface.co')
      return Response.json(tree)
    })
    const result = await artifactMetadata(plan, request, undefined, mirror)
    expect(result.total_download_bytes).toBe(4)
    expect(String(request.mock.calls[0]![0])).toBe(
      `https://huggingface.co/api/models/a/model/revision/${A}?blobs=true&files_metadata=true`
    )
  }
)
