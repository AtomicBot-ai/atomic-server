import { MCP_CONNECTORS } from '../contract/index.js'
import type { ConnectorConfig, ConnectorTemplate } from '../contract/index.js'
export function connectorTemplate(config: ConnectorConfig): ConnectorTemplate | undefined {
  return MCP_CONNECTORS.find(
    (item) =>
      item.serverKey.toLowerCase() === config.id.toLowerCase() ||
      item.matchUrls?.some((host) => {
        try {
          const name = new URL(config.url).hostname
          return name === host || name.endsWith(`.${host}`)
        } catch {
          return false
        }
      })
  )
}
export function connectorDraft(template: ConnectorTemplate, secret = ''): ConnectorConfig {
  const value: ConnectorConfig = {
    id: template.serverKey,
    name: template.name,
    type: template.config.command ? 'stdio' : 'http',
    url: '',
    command: '',
    args: [],
    env: {},
    headers: {},
    enabled: true,
    timeout: 30,
    ...structuredClone(template.config),
  }
  if (template.secret) {
    if (!secret.trim()) throw new Error(`Enter ${template.secret.label}.`)
    value[template.secret.kind === 'env' ? 'env' : 'headers'][template.secret.key] = template.secret.bearer
      ? `Bearer ${secret.trim()}`
      : secret.trim()
  }
  return value
}
export function connectorJson(configs: readonly ConnectorConfig[]): string {
  return JSON.stringify(
    {
      mcpServers: Object.fromEntries(
        configs.map(({ id, enabled, ...config }) => [id, { ...config, active: enabled }])
      ),
    },
    null,
    2
  )
}
export function parseConnectorJson(input: string): { mcpServers: Record<string, Record<string, unknown>> } {
  const value: unknown = JSON.parse(input)
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('mcpServers' in value))
    throw new Error('Use a JSON object with an mcpServers field.')
  const servers = value.mcpServers
  if (!servers || typeof servers !== 'object' || Array.isArray(servers))
    throw new Error('mcpServers must be an object.')
  for (const [id, entry] of Object.entries(servers)) {
    if (!id.trim() || !entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Each MCP server needs a name and a configuration object.')
    const c = entry as Record<string, unknown>
    if (c['type'] && !['http', 'sse', 'stdio'].includes(String(c['type'])))
      throw new Error(`${id}: choose http, sse or stdio transport.`)
    if (
      c['args'] !== undefined &&
      (!Array.isArray(c['args']) || c['args'].some((v: unknown) => typeof v !== 'string'))
    )
      throw new Error(`${id}: arguments must be a list of strings.`)
    for (const name of ['env', 'headers'])
      if (
        c[name] !== undefined &&
        (!c[name] ||
          typeof c[name] !== 'object' ||
          Array.isArray(c[name]) ||
          Object.values(c[name] as object).some((v) => typeof v !== 'string'))
      )
        throw new Error(`${id}: ${name} must contain text values.`)
  }
  return { mcpServers: servers as Record<string, Record<string, unknown>> }
}
