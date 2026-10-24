// Lifted from atomic-chat-ui constants/mcp-connectors.ts @ 807b4d9; adapted: shared browser-safe catalog.
import type { ConnectorConfig } from './workspace-features.js'
import { CONNECTORS_0 } from './mcp-catalog-0.js'
import { CONNECTORS_1 } from './mcp-catalog-1.js'
import { CONNECTORS_2 } from './mcp-catalog-2.js'
export interface ConnectorTemplate {
  serverKey: string
  name: string
  author: string
  description: string
  tagline: string
  icon: { bg: string; src?: string }
  featured?: boolean
  hidden?: boolean
  docsUrl?: string
  config: Partial<ConnectorConfig>
  matchUrls?: string[]
  auth?: 'oauth' | 'oauth-soon'
  secret?: {
    kind: 'env' | 'header'
    key: string
    label: string
    placeholder: string
    helpUrl?: string
    bearer?: boolean
  }
}
export const MCP_CONNECTORS: readonly ConnectorTemplate[] = [
  ...CONNECTORS_0,
  ...CONNECTORS_1,
  ...CONNECTORS_2,
]
