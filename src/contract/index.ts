/**
 * The browser-safe wire contract every client shares: the admin BFF's routes and types, the workspace
 * operation registry, navigation and setup goals. The daemon, CLI, MCP, terminal UI and web admin import
 * it; it imports only types from the rest of atc. No `node:*` here.
 */
export * from './api.js'
export * from './client-reports.js'
export * from './events.js'
export * from './routes.js'

export * from './workspace.js'
export * from './remote-access.js'
export * from './workspace-operations.js'
export * from './workspace-navigation.js'
export * from './setup-goals.js'
export * from './model-setup.js'
export * from './managed.js'
export * from './litert.js'
export * from './desktop-flows.js'
export * from './workspace-features.js'

export type { ConnectorTemplate } from './mcp-catalog.js'
