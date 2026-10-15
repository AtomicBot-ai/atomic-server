/**
 * The managed container runtime (TensorRT-LLM through Docker, later vLLM/SGLang) as the person
 * sees it in `atc engines install` and the admin wizard: a small state machine over the core's operation
 * phases. Pure transitions, table-tested; wiring to the core's `/environments` is iteration 4.
 */

import type { SetupState } from '../contract/index.js'
import type { ManagedPhase } from '../host/index.js'

export type SetupEvent =
  | { type: 'probe'; availability: 'supported' | 'setup-required' | 'prerequisite-blocked' | 'unsupported' }
  | { type: 'consent' }
  | { type: 'decline' }
  | { type: 'phase'; phase: ManagedPhase }
  | { type: 'resume' }

export const INITIAL_SETUP_STATE: SetupState = 'not-installed'

export function setupTransition(state: SetupState, event: SetupEvent): SetupState {
  switch (event.type) {
    case 'probe':
      if (event.availability === 'supported') return 'ready'
      if (event.availability === 'setup-required') return state === 'ready' ? 'ready' : 'consent'
      return 'failed'
    case 'consent':
      return state === 'consent' ? 'installing' : state
    case 'decline':
      return state === 'consent' || state === 'elevating' ? 'not-installed' : state
    case 'resume':
      return state === 'relogin-required' || state === 'reboot-required' || state === 'failed'
        ? 'installing'
        : state
    case 'phase':
      return stateForPhase(event.phase, state)
  }
}

export function stateForPhase(phase: ManagedPhase, current: SetupState): SetupState {
  switch (phase) {
    case 'awaiting-consent':
      return 'consent'
    case 'preparing-host':
      return 'elevating'
    case 'relogin-required':
      return 'relogin-required'
    case 'reboot-required':
      return 'reboot-required'
    case 'checking':
    case 'preparing-environment':
    case 'pulling-image':
    case 'verifying':
    case 'activating':
      return 'installing'
    case 'ready':
      return 'ready'
    case 'failed':
      return 'failed'
    case 'removing':
    case 'cancelling':
      return current
    case 'removed':
    case 'cancelled':
      return 'not-installed'
  }
}
