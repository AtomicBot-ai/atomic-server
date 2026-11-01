/**
 * Audio as both UIs show it: whether it is offered at all, the catalog's attribution, the form a model
 * takes. What a model takes is always the catalog's data, never decided by its id. Pure and browser-safe.
 */
import { PLAYGROUND_TASKS, SETUP_GOALS } from '../../contract/index.js'
import type {
  AudioJobPhase,
  AudioPlanDetails,
  WorkspaceServiceRow,
  WorkspaceSnapshot,
} from '../../contract/index.js'

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** A core without audio (0.20.5) leaves it out of every list; absent means that. */
export const audioAvailable = (snapshot: Pick<WorkspaceSnapshot, 'audio_available'> | null | undefined) =>
  snapshot?.audio_available === true

type Availability = Pick<WorkspaceSnapshot, 'audio_available'> | null | undefined

export const playgroundTasks = (snapshot: Availability) =>
  PLAYGROUND_TASKS.filter((task) => task.id !== 'audio' || audioAvailable(snapshot))

export const setupGoals = (snapshot: Availability) =>
  SETUP_GOALS.filter((goal) => goal.category !== 'audio' || audioAvailable(snapshot))

export const catalogCategories = <T extends string>(categories: readonly T[], snapshot: Availability) =>
  categories.filter((category) => category !== 'audio' || audioAvailable(snapshot))

/** The notice a model's license asks for, from a catalog row or a download's plan. */
export function attributionOf(model: unknown): string {
  const row = record(model)
  const value =
    record(row['source'])['attribution'] ??
    record(record(row['plan'])['audio'])['attribution'] ??
    record(row['audio'])['attribution'] ??
    row['attribution']
  return typeof value === 'string' ? value : ''
}

/** The audio model the core has ready, when it has one. */
export function loadedAudioModel(
  snapshot: Pick<WorkspaceSnapshot, 'services'> | null | undefined
): WorkspaceServiceRow | undefined {
  return snapshot?.services.find(
    (service) => service.kind === 'audio' && ['ready', 'loaded'].includes(service.state)
  )
}

/** What the catalog said about a model, from its download's record in `setups` or `artifacts.list`. */
export function audioDetails(
  jobs: readonly unknown[] | undefined,
  modelId: string | undefined
): AudioPlanDetails | null {
  const plan = (jobs ?? [])
    .map((job) => record(record(job)['plan']))
    .find((candidate) => candidate['model_id'] === modelId && candidate['audio'])
  return plan ? (plan['audio'] as AudioPlanDetails) : null
}

export interface AudioControl {
  /** The field of `audio.generate`'s request. */
  name: string
  label: string
  kind: 'number' | 'text' | 'long-text' | 'voice'
  default?: number
  min?: number
  max?: number
}

const CONTROLS: Readonly<Record<string, Pick<AudioControl, 'label' | 'kind'>>> = {
  voice: { label: 'Voice', kind: 'voice' },
  speed: { label: 'Speed', kind: 'number' },
  language: { label: 'Language', kind: 'text' },
  instruct: { label: 'Style', kind: 'text' },
  lyrics: { label: 'Lyrics', kind: 'long-text' },
  durationSec: { label: 'Length (seconds)', kind: 'number' },
  bpm: { label: 'Beats per minute', kind: 'number' },
  steps: { label: 'Steps', kind: 'number' },
  negativePrompt: { label: 'Negative prompt', kind: 'text' },
  seed: { label: 'Seed', kind: 'number' },
}

/** The form of a model; a control this client does not know is left out. */
export function audioControls(details: AudioPlanDetails | null): AudioControl[] {
  return (details?.controls ?? []).flatMap((name) => {
    const control = CONTROLS[name],
      value = details?.defaults[name],
      range = details?.ranges[name]
    if (!control) return []
    return [
      {
        name,
        ...control,
        ...(value !== undefined ? { default: value } : {}),
        ...(range?.[0] !== undefined ? { min: range[0] } : {}),
        ...(range?.[1] !== undefined ? { max: range[1] } : {}),
      },
    ]
  })
}

/** A job's request from a form: nothing left empty, and a number within the catalog's range. */
export function audioJobRequest(values: Record<string, unknown>, controls: readonly AudioControl[]) {
  const request = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== '' && value !== undefined)
  )
  for (const { name, min, max } of controls) {
    const value = request[name]
    if (typeof value === 'number') request[name] = Math.min(max ?? value, Math.max(min ?? value, value))
  }
  return request
}

const PHASES: Readonly<Record<AudioJobPhase, string>> = {
  queued: 'Waiting to start',
  loading: 'Starting the audio engine',
  generating: 'Generating',
  saving: 'Saving the clip',
}

/** audio.cpp reports no percentage: a job is its phase and how long it has run. */
export function audioPhaseText(progress: { phase: AudioJobPhase; elapsedMs: number } | null | undefined) {
  if (!progress) return PHASES.queued
  const seconds = Math.floor(progress.elapsedMs / 1000)
  return `${PHASES[progress.phase]}${seconds ? ` · ${seconds} s` : ''}`
}
