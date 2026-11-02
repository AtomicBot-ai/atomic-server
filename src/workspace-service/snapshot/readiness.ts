import type { CoreLink } from '../../core-link/index.js'
import type { AtcConfig } from '../../config/index.js'
import type { ClientKeys } from '../../terminal-data/index.js'
import type { WorkspaceServiceRow } from '../../contract/index.js'
import { AtcError } from '../../errors/index.js'
import { callPublic } from './public-api.js'
import { object } from '../validation.js'
import type { AudioJob, AudioMode } from '../../contract/index.js'

const VERIFICATION_DEADLINE_MS = 600000

/** The smallest real clip: a word to say, or the shortest sound the loaded model's mode can make. */
async function verifyAudio(link: CoreLink, service: WorkspaceServiceRow) {
  const mode = object(object(service.details['model'])['loaded'])['mode'] as AudioMode
  const { id } = await link.request<AudioJob>('POST', '/audio/jobs', {
    mode,
    request: mode === 'speech' ? { text: 'Ready.' } : { text: 'A short soft click.', durationSec: 1 },
  })
  const deadline = Date.now() + VERIFICATION_DEADLINE_MS
  while (Date.now() < deadline) {
    const { job } = await link.request<{ job: AudioJob | null }>('GET', `/audio/jobs/${id}`)
    if (job?.state === 'completed') return { task: 'audio', job_id: id }
    if (!job || ['failed', 'cancelled'].includes(job.state))
      throw new AtcError('ATC_USAGE', job?.error?.message ?? 'The verification job failed.')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new AtcError('ATC_USAGE', 'Verification is still running. Check the job before trying again.')
}
/** A successful small inference, not a populated model menu, completes guided setup. */
export async function verifyWorkload(
  link: CoreLink,
  config: AtcConfig,
  keys: ClientKeys,
  request: typeof fetch,
  services: WorkspaceServiceRow[]
) {
  const ready = services.filter((s) => ['ready', 'running', 'loaded'].includes(s.state))
  if (!ready.length) throw new AtcError('ATC_USAGE', 'Load a model before finishing setup.')
  const chat = ready.find((s) => s.kind === 'chat')
  if (chat) {
    await callPublic(link, config, keys, request, '/chat/completions', {
      model: chat.model,
      messages: [{ role: 'user', content: 'Reply OK.' }],
      max_tokens: 1,
      stream: false,
    })
    return { task: 'chat', model: chat.model }
  }
  if (ready.some((s) => s.kind === 'embedding')) {
    const result = await link.request<{ status: number; body: unknown }>('POST', '/embedding/embed', {
      input: 'Connection test',
    })
    if (result.status < 200 || result.status >= 300)
      throw new AtcError('ATC_USAGE', 'The embedding verification failed.')
    return { task: 'embedding' }
  }
  if (ready.some((s) => s.kind === 'decision')) {
    const result = await link.request<{ unavailable: boolean; message?: string }>(
      'POST',
      '/decision/decide',
      {
        state: 'A server connection is being tested.',
        questions: { ready: { type: 'noul', instructions: 'Does the text describe a connection test?' } },
      }
    )
    if (result.unavailable)
      throw new AtcError('ATC_USAGE', result.message ?? 'The decision model is unavailable.')
    return { task: 'decision' }
  }
  const audio = ready.find((s) => s.kind === 'audio')
  if (audio) return verifyAudio(link, audio)
  const media = ready.find((s) => s.kind === 'image-video')!
  const loaded = object(object(media.details['model'])['loaded']),
    video = loaded['modality'] === 'video'
  const prefix = video ? '/diffusion/video' : '/diffusion'
  const caps = await link.request<Record<string, unknown>>('GET', `${prefix}/capabilities`),
    defaults = object(caps['defaults']),
    ranges = object(caps['ranges']),
    videoDefaults = object(defaults['video'])
  const dims = Array.isArray(ranges['dims']) ? (ranges['dims'] as number[]) : [Number(caps['minDim'] ?? 256)]
  const steps = Array.isArray(ranges['steps']) ? (ranges['steps'] as number[]) : [1]
  const body = {
    prompt: 'A small turquoise circle on a black background.',
    width: dims[0],
    height: dims[0],
    steps: steps[0],
    cfgScale: Number(defaults['cfgScale'] ?? 1),
    seed: 1,
    ...(video
      ? {
          fps: videoDefaults['fps'],
          frames: Array.isArray(ranges['frames']) ? ranges['frames'][0] : videoDefaults['frames'],
        }
      : { batchSize: 1, workflow: 'create' }),
  }
  const job = object(await link.request('POST', `${prefix}/jobs`, body)),
    jobId = String(job['jobId'] ?? job['id'] ?? object(job['job'])['id'] ?? '')
  if (!jobId) throw new AtcError('ATC_USAGE', 'The verification job did not return an ID.')
  const deadline = Date.now() + VERIFICATION_DEADLINE_MS
  while (Date.now() < deadline) {
    const { job: state } = await link.request<{
      job: { state: string; error?: { message?: string } } | null
    }>('GET', `${prefix}/jobs/${encodeURIComponent(jobId)}`)
    if (state?.state === 'completed') return { task: video ? 'video' : 'image', job_id: jobId }
    if (!state || ['failed', 'cancelled'].includes(state.state))
      throw new AtcError('ATC_USAGE', state?.error?.message ?? 'The verification job failed.')
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new AtcError('ATC_USAGE', 'Verification is still running. Check the job before trying again.')
}
