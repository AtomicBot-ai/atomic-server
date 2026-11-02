import { AtomicCoreError } from '@atomic-chat/core'
import type { AudioCapabilities, AudioStatus, WorkspaceInput } from '../../contract/index.js'
import type { CoreLink } from '../../core-link/index.js'
import { audioDetails } from '../../workspace-view/index.js'
import { object } from '../validation.js'
import { audioRequest } from './audio-core.js'

/** For a model loaded by hand (`audio.load`): it has no download to read a default from. */
const FALLBACK_DURATION_SEC = 10

/**
 * A music or effects job always names its length: left to itself the engine can make minutes of audio.
 * The length is the default the catalog gave the loaded model, read from its download, so an agent's
 * request behaves like the forms' and a job never waits on conf.
 */
export async function withAudioDuration(
  link: CoreLink,
  downloads: () => Promise<readonly unknown[]>,
  input: WorkspaceInput
): Promise<Record<string, unknown>> {
  const request = object(input['request'])
  if (input['mode'] === 'speech' || request['durationSec'] !== undefined) return request
  const status = await audioRequest<Partial<AudioStatus>>(link, 'GET', '/audio/status')
  let modelId = status.model?.loaded?.modelId
  if (!modelId) {
    // Cancel and a crash stop the process but keep its spec and capabilities for the next job.
    try {
      modelId = (await audioRequest<Partial<AudioCapabilities>>(link, 'GET', '/audio/capabilities')).modelId
    } catch (error) {
      if (!(error instanceof AtomicCoreError && error.code === 'MODEL_NOT_LOADED')) throw error
    }
  }
  const details = audioDetails(await downloads(), modelId)
  return { ...request, durationSec: details?.defaults['durationSec'] ?? FALLBACK_DURATION_SEC }
}
