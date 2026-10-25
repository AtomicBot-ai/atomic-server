import type { Workspace } from '../useWorkspace'
import { Action, Copy, Panel } from '../Controls'

const operations: Record<string, [string, string][]> = {
  'image-video': [
    ['media.image.create', 'Image request'],
    ['media.video.create', 'Video request'],
  ],
  'embedding': [['media.embedding.run', 'Embedding request']],
  'decision': [
    ['media.decision.run', 'Classification request'],
    ['media.router.run', 'Routing request'],
  ],
}

export function ServiceConnections({
  workspace,
  openCommand,
}: {
  workspace: Workspace
  openCommand: (name: string) => void
}) {
  const services = workspace.snapshot?.services.filter((s) => s.kind !== 'chat') ?? []
  if (!services.length) return null
  return (
    <Panel title="Service integrations">
      <p>
        These workloads use the local server control interface. Use the CLI on the server machine, or register{' '}
        <code>atc mcp</code> with an agent that supports MCP. They do not use the agent chat endpoint below.
      </p>
      {services.map((service) => (
        <div className="service-connection" key={service.id}>
          <h3>
            {service.model || service.kind} <small>· {service.state}</small>
          </h3>
          {(operations[service.kind] ?? []).map(([operation, label]) => (
            <div key={operation}>
              <div className="ew-actions">
                <Action onClick={() => openCommand(operation)}>{label}</Action>
                <Copy
                  value={`atc control call ${operation} --input @request.json --json`}
                  label="Copy CLI command"
                />
              </div>
              <code>atc control call {operation} --input @request.json --json</code>
            </div>
          ))}
        </div>
      ))}
      <p className="ew-muted">
        Open a request to see its fields and prepare the JSON input. Include
        <code> --data-folder /path/to/profile</code> when using a separate server profile.
      </p>
    </Panel>
  )
}
