/** The daemon-owned workspace: operation dispatch to the core, snapshots, jobs and its client. */
export * from './service.js'
export * from './state.js'
export { WORKSPACE_OPERATIONS } from '../contract/index.js'
export type { WorkspaceOperation, WorkspaceSnapshot, WorkspaceInput } from '../contract/index.js'
export * from './client.js'
export { sanitized as sanitizeWorkspaceData } from './validation.js'
export type { FoundrySearchResult, FoundryModelRow, FoundryVariantRow } from './foundry-catalog.js'
export { contextExceeded } from './chat-request.js'
