import { describe, expect, it } from 'vitest'
import type { AudioPlanDetails, WorkspaceServiceRow } from '../../contract/index.js'
import {
  attributionOf,
  audioAvailable,
  audioControls,
  audioDetails,
  audioJobRequest,
  audioPhaseText,
  catalogCategories,
  loadedAudioModel,
  playgroundTasks,
  setupGoals,
} from './audio-view.js'

const ids = (list: readonly { id: string }[]) => list.map((item) => item.id)
const details = (over: Partial<AudioPlanDetails> = {}): AudioPlanDetails => ({
  mode: 'effects',
  attribution: null,
  controls: [],
  defaults: {},
  ranges: {},
  ...over,
})

describe('offering audio', () => {
  it('is off without the core saying it has audio', () => {
    for (const snapshot of [null, undefined, {}, { audio_available: false }])
      expect(audioAvailable(snapshot)).toBe(false)
  })

  it.each([
    [{ audio_available: true }, ['chat', 'image', 'video', 'audio']],
    [{ audio_available: false }, ['chat', 'image', 'video']],
    [null, ['chat', 'image', 'video']],
  ])('playground tasks for %j', (snapshot, expected) => {
    expect(ids(playgroundTasks(snapshot))).toEqual(expected)
  })

  it('hides the setup goal and the catalog category with it', () => {
    expect(ids(setupGoals({ audio_available: true }))).toContain('audio')
    expect(ids(setupGoals(null))).not.toContain('audio')
    const categories = ['text', 'audio'] as const
    expect(catalogCategories(categories, { audio_available: true })).toEqual(['text', 'audio'])
    expect(catalogCategories(categories, {})).toEqual(['text'])
  })
})

describe('attributionOf', () => {
  it.each([
    ['a catalog row', { source: { attribution: 'Powered by X' } }, 'Powered by X'],
    ['a download job', { plan: { audio: { attribution: 'Powered by X' } } }, 'Powered by X'],
    ['a plan', { audio: { attribution: 'Powered by X' } }, 'Powered by X'],
    ['a model without one', { source: { attribution: null } }, ''],
    ['nothing', undefined, ''],
  ])('reads %s', (_name, model, expected) => {
    expect(attributionOf(model)).toBe(expected)
  })
})

describe('loadedAudioModel', () => {
  const service = (over: Partial<WorkspaceServiceRow>): WorkspaceServiceRow => ({
    id: 'audio',
    provider: 'audio-cpp',
    model: 'a:q8',
    kind: 'audio',
    state: 'loaded',
    details: {},
    ...over,
  })

  it('finds the model that is ready, never one still loading', () => {
    expect(loadedAudioModel({ services: [service({})] })?.model).toBe('a:q8')
    expect(loadedAudioModel({ services: [service({ state: 'loading' })] })).toBeUndefined()
    expect(loadedAudioModel({ services: [service({ kind: 'chat' })] })).toBeUndefined()
    expect(loadedAudioModel(null)).toBeUndefined()
  })
})

describe('audioDetails', () => {
  it('reads what the catalog said from the model’s download', () => {
    const audio = details({ controls: ['seed'] })
    const jobs = [{ plan: { model_id: 'other' } }, { plan: { model_id: 'a:q8', audio } }]
    expect(audioDetails(jobs, 'a:q8')).toBe(audio)
    expect(audioDetails(jobs, 'b:q8')).toBeNull()
    expect(audioDetails(undefined, 'a:q8')).toBeNull()
  })
})

describe('audioControls', () => {
  it('draws the form from the catalog: controls, defaults and ranges', () => {
    expect(
      audioControls(
        details({
          controls: ['durationSec', 'seed'],
          defaults: { durationSec: 5, seed: 42 },
          ranges: { durationSec: [1, 30] },
        })
      )
    ).toEqual([
      { name: 'durationSec', label: 'Length (seconds)', kind: 'number', default: 5, min: 1, max: 30 },
      { name: 'seed', label: 'Seed', kind: 'number', default: 42 },
    ])
  })

  it('leaves out a control this client does not know, and everything without a model', () => {
    expect(audioControls(details({ controls: ['someday', 'voice'] })).map((c) => c.name)).toEqual(['voice'])
    expect(audioControls(null)).toEqual([])
  })
})

describe('audioJobRequest', () => {
  const controls = audioControls(
    details({ controls: ['durationSec', 'seed'], ranges: { durationSec: [1, 30] } })
  )

  it.each([
    [500, 30],
    [0, 1],
    [12, 12],
  ])('holds a length of %d to the catalog range', (durationSec, expected) => {
    expect(audioJobRequest({ text: 'a', durationSec }, controls)).toEqual({
      text: 'a',
      durationSec: expected,
    })
  })

  it('leaves out what the form left empty, and a number without a range alone', () => {
    expect(audioJobRequest({ text: 'a', durationSec: '', seed: 123456 }, controls)).toEqual({
      text: 'a',
      seed: 123456,
    })
  })
})

describe('audioPhaseText', () => {
  it.each([
    [null, 'Waiting to start'],
    [{ phase: 'loading', elapsedMs: 200 }, 'Starting the audio engine'],
    [{ phase: 'generating', elapsedMs: 12_400 }, 'Generating · 12 s'],
    [{ phase: 'saving', elapsedMs: 1000 }, 'Saving the clip · 1 s'],
  ] as const)('%j', (progress, expected) => {
    expect(audioPhaseText(progress)).toBe(expected)
  })
})
