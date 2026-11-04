import { describe, expect, it } from 'vitest'
import { artifactPlan, destinationOf } from './artifact-plan.js'
import type { CatalogRow } from './catalog.js'

const revision = 'a'.repeat(40),
  sha256 = 'b'.repeat(64)
function row(over: Record<string, unknown> = {}, quant: Record<string, unknown> = {}): CatalogRow {
  return {
    id: 'voice-model',
    name: 'Voice Model',
    category: 'audio',
    description: '',
    source: {
      mode: 'speech',
      engines: ['audio-cpp'],
      family: 'voice_family',
      task: 'tts',
      repo: 'owner/repo',
      revision,
      quants: [
        { id: 'q8_0', path: 'Dir/model q8.gguf', filename: 'model-q8.gguf', bytes: 10, sha256, ...quant },
      ],
      controls: ['voice', 'seed'],
      defaults: { seed: 42 },
      ...over,
    },
  }
}

describe('an audio model plan', () => {
  it('downloads into the audio models folder at the pinned revision, with size and digest', () => {
    const plan = artifactPlan(row(), '/data')
    expect(plan).toMatchObject({
      category: 'audio',
      model_id: 'voice-model:q8_0',
      engine: 'audio-cpp',
      total_download_bytes: 10,
    })
    expect(plan.files).toEqual([
      {
        url: `https://huggingface.co/owner/repo/resolve/${revision}/Dir/model%20q8.gguf`,
        save_path: 'audio/models/model-q8.gguf',
        source: { repo: 'owner/repo', revision, path: 'Dir/model q8.gguf', purpose: 'model' },
        size: 10,
        sha256,
      },
    ])
  })

  it('loads the file by its name under that folder, as the family and task the catalog names', () => {
    expect(artifactPlan(row(), '/data').load).toEqual({
      modelId: 'voice-model:q8_0',
      displayName: 'Voice Model',
      mode: 'speech',
      file: 'model-q8.gguf',
      family: 'voice_family',
      task: 'tts',
    })
  })

  it('carries the default voice and the options a model needs', () => {
    const { load } = artifactPlan(
      row({
        default_voice: 'vivian',
        load_options: { threads: 2 },
        session_options: { 'a.b': true },
        default_request_options: { top_k: 5 },
      }),
      '/data'
    )
    expect(load).toMatchObject({
      defaultVoice: 'vivian',
      loadOptions: { threads: 2 },
      sessionOptions: { 'a.b': true },
      defaultRequestOptions: { top_k: 5 },
    })
  })

  it('leaves a missing voice out of the load', () => {
    expect(artifactPlan(row({ default_voice: null }), '/data').load).not.toHaveProperty('defaultVoice')
  })

  it('keeps what clients draw beside the load, which goes to the core as it is', () => {
    const plan = artifactPlan(
      row({
        attribution: 'Powered by Someone',
        controls: ['durationSec'],
        defaults: { durationSec: 5 },
        ranges: { durationSec: [1, 30] },
      }),
      '/data'
    )
    expect(plan.audio).toEqual({
      mode: 'speech',
      attribution: 'Powered by Someone',
      controls: ['durationSec'],
      defaults: { durationSec: 5 },
      ranges: { durationSec: [1, 30] },
    })
    expect(plan.load).not.toHaveProperty('attribution')
  })

  it("keeps the maker's logo key and the one-line description for the model picker", () => {
    const described = { ...row({ icon: 'stability' }), description: 'Sound effects from a prompt.' }
    expect(artifactPlan(described, '/data').audio).toMatchObject({
      icon: 'stability',
      description: 'Sound effects from a prompt.',
    })
    const odd = artifactPlan(row({ icon: '../logo.svg' }), '/data').audio
    expect(odd).not.toHaveProperty('icon')
    expect(odd).not.toHaveProperty('description')
  })

  it('picks the recommended quantization, or the one asked for', () => {
    const source = row().source
    const q = (id: string, recommended = false) => ({
      id,
      path: `${id}.gguf`,
      filename: `${id}.gguf`,
      bytes: 1,
      sha256,
      recommended,
    })
    const both = { ...row(), source: { ...source, quants: [q('a'), q('b', true)] } }
    expect(artifactPlan(both, '/data').model_id).toBe('voice-model:b')
    expect(artifactPlan(both, '/data', 'a').model_id).toBe('voice-model:a')
    expect(() => artifactPlan(both, '/data', 'c')).toThrow(expect.objectContaining({ code: 'ATC_USAGE' }))
  })

  it('reports an empty catalog quantization list as an invalid catalog', () => {
    expect(() => artifactPlan(row({ quants: [] }), '/data')).toThrow('Invalid audio catalog entry')
  })

  it.each([
    ['a floating revision', { revision: 'main' }, {}, 'a full commit SHA'],
    ['a repository the Hub would not name', { repo: 'owner/..' }, {}, 'repository'],
    ['a path outside the repository', {}, { path: '../secret.gguf' }, 'path'],
    ['a file name with a folder', {}, { filename: '../../evil.gguf' }, 'filename'],
    ['no digest', {}, { sha256: undefined }, 'sha256'],
    ['no size', {}, { bytes: 0 }, 'size'],
    ['an unknown mode', { mode: 'singing' }, {}, 'mode'],
    ['an unknown task', { task: 'other' }, {}, 'task'],
  ])('refuses %s', (_name, over, quant, problem) => {
    expect(() => artifactPlan(row(over, quant), '/data')).toThrow(problem)
  })

  it('binds its digest to everything in the plan', () => {
    const plan = artifactPlan(row(), '/data')
    expect(artifactPlan(row(), '/data').digest).toBe(plan.digest)
    expect(artifactPlan(row({ attribution: 'x' }), '/data').digest).not.toBe(plan.digest)
  })

  it('writes one file at a time per model file', () => {
    expect(destinationOf(artifactPlan(row(), '/data'))).toBe('audio/models/model-q8.gguf')
  })
})
