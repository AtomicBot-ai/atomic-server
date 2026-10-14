import type { WorkspaceState } from './state.js'
export function serverEndpoint(s: WorkspaceState): string {
  const api =
    s.base.daemon.kind === 'up' && s.base.daemon.snapshot.server.running
      ? s.base.daemon.snapshot.server
      : undefined
  const value = (key: string, fallback: string) =>
    s.base.config.rows.find((r) => r.path === key)?.value ?? fallback
  let host = api?.host ?? value('api.host', '127.0.0.1')
  if (host === '0.0.0.0' || host === '::') host = '127.0.0.1'
  return `http://${host.includes(':') ? '[' + host + ']' : host}:${api?.port ?? value('api.port', '1337')}${api?.prefix ?? value('api.prefix', '/v1')}`
}
export function example(s: WorkspaceState): string {
  // Shell placeholders intentionally contain no model IDs or credentials from the server.
  return `curl '${serverEndpoint(s).replaceAll("'", "'\\''")}'/chat/completions -H 'Content-Type: application/json' -H "Authorization: Bearer $ATC_API_KEY" -d '{"model":"MODEL_ID","messages":[{"role":"user","content":"Hello"}]}'`
}
