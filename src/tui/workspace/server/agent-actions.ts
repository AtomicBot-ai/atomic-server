/** The agent sidebar: a model for the agent, a model switch, and the handoff that leaves the terminal. */
import type { ActionContext } from '../action-types.js'
import type { AgentId } from '../../../agent-launch/index.js'
import { serverEndpoint } from './connection.js'
import type { WorkspaceState } from '../state.js'

export async function agentAction(id: string, ctx: ActionContext): Promise<boolean> {
  const { update, controller, get } = ctx,
    s = get()
  const patch = (part: Partial<WorkspaceState>) => update((v) => ({ ...v, ...part }))
  if (id.startsWith('agent:')) {
    if (
      (!s.setupComplete || s.firstRun) &&
      !(s.connection?.step === 'done' && s.connection.agent === id.slice(6))
    ) {
      patch({ message: 'Finish this connection before launching the agent.' })
      return true
    }
    if (s.base.daemon.kind !== 'up' || !s.base.daemon.snapshot.server.running) {
      patch({ message: 'Start the API, then open an agent.' })
      return true
    }
    patch({ busy: true, message: 'Finding a model for this agent...' })
    try {
      const models = await controller.models(serverEndpoint(s), true)
      if (!models.length) throw new Error('Load a text model in Models before opening an agent.')
      patch({
        agent: id.slice(6) as AgentId,
        agentModel: models.includes(s.model) ? s.model : models[0]!,
        models,
        overlay: 'agent',
        focus: 'launch-agent',
        message: '',
      })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id === 'agent-model') {
    const i = s.models.indexOf(s.agentModel)
    patch({ agentModel: s.models[(i + 1) % s.models.length] ?? '' })
    return true
  }
  if (id === 'launch-agent') {
    if (!ctx.handoff) throw new Error('Agent handoff is unavailable in this terminal.')
    patch({ busy: true, message: 'Preparing the agent...' })
    try {
      const launch = await controller.prepareAgent(s.agent, serverEndpoint(s), s.agentModel)
      ctx.handoff(launch)
    } finally {
      patch({ busy: false })
    }
    return true
  }
  return false
}
