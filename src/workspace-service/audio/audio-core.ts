/**
 * The core's `/audio/*` routes, and what a core without them (0.20.5) answers. Such a core says "no such
 * control route" and refuses `audio-cpp` under `/engine-builds`; here that becomes one plain refusal, and
 * a snapshot, which reads every status, stays quiet about it.
 *
 * core-workaround: no-audio-core until core 0.21.0 — once the pin has audio, every core atc runs on has
 * these routes: remove `noAudioCore`, `requireAudioCore`, `audio_available` and what hides audio without it.
 */
import { isMissingRoute } from '../../core-link/index.js'
import type { CoreLink } from '../../core-link/index.js'
import { AtcError } from '../../errors/index.js'

export const noAudioCore = () =>
  new AtcError('ATC_NOT_IMPLEMENTED', "Audio generation is not available: this server's core has no audio.", {
    hint: 'update atc to a release with audio.cpp',
  })

/** A call to the core's audio routes; a core without them answers with `noAudioCore`. */
export async function audioRequest<T = unknown>(
  link: CoreLink,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  try {
    return await link.request<T>(method, path, body)
  } catch (error) {
    throw isMissingRoute(error) ? noAudioCore() : error
  }
}

/** Refuse work that only makes sense with audio (a download, an engine install) before it starts. */
export const requireAudioCore = (link: CoreLink): Promise<void> =>
  audioRequest(link, 'GET', '/audio/status').then(() => undefined)
