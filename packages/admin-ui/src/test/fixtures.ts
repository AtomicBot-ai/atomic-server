import type { AdminStatus } from '@contract'

export function statusFixture(overrides: Partial<AdminStatus> = {}): AdminStatus {
  return {
    atc: { version: '0.1.0', git_sha: 'abc1234', build_date: '2026-09-20', admin_ui: 'build-deadbeef' },
    core: { version: '0.4.0', instance_id: 'inst-42', pid: 4243, protocol: 3, uptime_ms: 125_000 },
    daemon: { pid: 4242, started_at: Date.now() - 60_000, data_folder: '/srv/atc-data' },
    admin: { host: '127.0.0.1', port: 1338, url: 'http://127.0.0.1:1338' },
    api: { running: true, host: '0.0.0.0', port: 1337, prefix: '/v1', requires_api_key: true, pid: 4244 },
    sessions: [
      {
        provider: 'llamacpp-upstream',
        pid: 5001,
        port: 39001,
        model_id: 'qwen3-8b-q4',
        model_path: '/srv/atc-data/models/qwen3-8b-q4.gguf',
        is_embedding: false,
        api_key: '',
      },
    ],
    pending_host_steps: [],
    ...overrides,
  }
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
