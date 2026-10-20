import { vi } from 'vitest'
import { WORKSPACE_OPERATIONS } from '@contract'
import type { WorkspaceSnapshot } from '@contract'
import type { Workspace } from '@/workspace/useWorkspace'
import type { Execute } from '@/workspace/types'

/** A workspace snapshot with nothing running, its fields overridable. */
export function snapshotFixture(over: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    version: 1,
    captured_at: 1,
    core: { version: '0.18.5', instance_id: 'test', uptime_ms: 30 },
    api: {
      running: true,
      endpoint: 'http://127.0.0.1:1337/v1',
      host: '127.0.0.1',
      port: 1337,
      prefix: '/v1',
      raw: {},
    },
    eye: 'ready',
    services: [],
    downloads: [],
    setups: [],
    setup: { mode: 'guided', complete: true, updated_at: 1 },
    keys: [],
    metrics: {
      window_ms: 300000,
      requests: 0,
      errors: 0,
      active: null,
      mean_latency_ms: null,
      mean_ttft_ms: null,
      tokens_per_second: null,
      since: 1,
    },
    requests: [],
    errors: [],
    engines: [],
    host_steps: [],
    loads: [],
    ...over,
  }
}

/** A workspace whose operations `answer` by name (a function gets the input). */
export function workspaceFixture(answer: Record<string, unknown>, over: Partial<WorkspaceSnapshot> = {}) {
  const execute = vi.fn(async (name: string, input: Record<string, unknown> = {}) => {
    const a = answer[name]
    return typeof a === 'function' ? (a as (i: Record<string, unknown>) => unknown)(input) : (a ?? {})
  })
  const workspace: Workspace = {
    snapshot: snapshotFixture(over),
    operations: [...WORKSPACE_OPERATIONS],
    execute: execute as unknown as Execute,
    loading: false,
    error: '',
    pending: [],
    refresh: vi.fn(),
  }
  return { workspace, execute }
}

/** `engines.list` of a host that registers `engines` (installed ones with an active build). */
export const enginesList = (engines: string[], installed: string[] = engines) => ({
  engines: engines.map((engine) => ({
    engine,
    kind: ['vllm', 'sglang', 'tensorrt-llm'].includes(engine)
      ? 'managed'
      : engine.startsWith('llamacpp') || engine === 'atomic-prism'
        ? 'llamacpp'
        : 'engine-build',
    active: installed.includes(engine) ? { version: 'v1', variant: 'cpu' } : null,
    latest: { version: 'v1', variant: 'cpu' },
  })),
})
