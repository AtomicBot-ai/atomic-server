/** A built-in MCP connector's card: the catalog itself is `MCP_CONNECTORS` in `src/workspace-view/`. */
import type { ConnectorConfig } from './workspace-features.js'
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
