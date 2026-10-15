import type { WorkspaceField, WorkspaceOperation } from '../workspace.js'

/** The fields an operation takes; none by default. */
export interface OperationInput {
  properties?: Record<string, WorkspaceField>
  required?: string[]
}

/**
 * One registry entry. The group is the name's first segment; an operation mutates unless its effect is
 * `read`, and a `secret` that only reveals a value passes `{ mutates: false }`. The description is what an
 * agent sees as the MCP tool description, so it says what the operation does, not its title again.
 */
export function operation(
  name: string,
  title: string,
  effect: WorkspaceOperation['effect'],
  description: string,
  input: OperationInput = {},
  options: { mutates?: boolean } = {}
): WorkspaceOperation {
  return {
    name,
    title,
    group: name.split('.')[0]!,
    description,
    mutates: options.mutates ?? effect !== 'read',
    effect,
    inputSchema: {
      type: 'object',
      properties: input.properties ?? {},
      required: input.required ?? [],
      additionalProperties: false,
    },
  }
}

/** A pass-through `request` body for Core: the listed fields are documented, others are forwarded as is. */
export function request(properties: Record<string, WorkspaceField>, required: string[] = []): WorkspaceField {
  return { type: 'object', properties, required, additionalProperties: true }
}
