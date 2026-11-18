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

it.each([
  '',
  '   ',
  'hf-mirror.example',
  'https:mirror.example',
  'ftp://mirror.example',
  'https://user:secret@mirror.example',
  'https://mirror.example/hub?query=1',
  'https://mirror.example/hub#fragment',
])('rejects an invalid configured Hub without sending a request (%j)', async (mirror) => {
  const request = vi.fn<typeof fetch>()
  await expect(artifactMetadata(plan, request, 'hub-token', mirror)).rejects.toMatchObject({
    code: 'ATC_USAGE',
    message: expect.stringContaining('HF_ENDPOINT'),
  })
  expect(request).not.toHaveBeenCalled()
})

it.each([
  [undefined, 'https://huggingface.co'],
  ['https://mirror.example/hub/', 'https://mirror.example/hub'],
])('sends the token to the selected Hub (%j)', async (mirror, destination) => {
  const request = vi.fn<typeof fetch>(async () => Response.json(tree))
  const result = await artifactMetadata(plan, request, 'hub-token', mirror)
  expect(result.total_download_bytes).toBe(4)
  expect(request).toHaveBeenCalledWith(
    `${destination}/api/models/a/model/revision/${A}?blobs=true&files_metadata=true`,
    expect.objectContaining({ headers: { Authorization: 'Bearer hub-token' }, redirect: 'error' })
  )
})
