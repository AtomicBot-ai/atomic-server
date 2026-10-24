import type { WorkspaceFeatures } from '../contract/index.js'

/** Stable, collision-resistant names keep connector tools distinct in a model's function list. */
export function connectorToolBindings(features: WorkspaceFeatures | undefined, ids: string[]) {
  return (features?.connectors ?? [])
    .filter((c) => c.enabled && ids.includes(c.id))
    .flatMap((c) =>
      (features?.connector_status[c.id]?.state === 'connected'
        ? features.connector_status[c.id]!.tools
        : []
      ).map((tool) => {
        let hash = 2166136261
        for (const char of `${c.id}:${tool.name}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
        const name = `mcp_${hash.toString(16)}_${tool.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)}`
        return {
          id: c.id,
          tool: tool.name,
          name,
          definition: {
            type: 'function',
            function: {
              name,
              description: tool.description ?? `${c.name}: ${tool.name}`,
              parameters: tool.inputSchema,
            },
          },
        }
      })
    )
}
