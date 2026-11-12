import type { WorkspaceState } from '../state.js'
import { loadStageText, operationView } from '../../../workspace-view/index.js'

/**
 * The privileged steps the server waits on, with the command to run as administrator, and the managed
 * engine operations in progress — from the snapshot; before the first one, the steps the daemon reported.
 */
export function cockpitNotices(
  s: WorkspaceState
): Array<{ text: string; command: boolean; id?: string; hint?: string }> {
  const steps = s.workspace?.host_steps ?? (s.base.daemon.kind === 'up' ? s.base.daemon.pending : [])
  return [
    ...steps.flatMap((step) => [
      { text: 'Waiting for a privileged step; run as administrator:', command: false },
      { text: step.instructions, command: true },
    ]),
    ...(s.workspace?.engines ?? []).flatMap((e) =>
      e.operation ? [{ text: operationView(e.operation).text, command: false }] : []
    ),
    ...(s.workspace?.loads ?? []).map((l) => ({
      text: `${l.provider}  ${l.model_id}  · ${loadStageText({ ...l, elapsed_ms: l.elapsed_ms + Math.max(0, Date.now() - l.at) })}`,
      command: false,
    })),
    // This terminal's failed load: the core keeps no failure, so only the client that loaded knows it.
    ...(s.loadError
      ? [
          {
            text: `Load failed: ${s.loadError.model} on ${s.loadError.provider}: ${s.loadError.message}`,
            command: false,
            id: 'load-log',
            hint: 'View the last attempt’s log',
          },
        ]
      : []),
  ]
}
