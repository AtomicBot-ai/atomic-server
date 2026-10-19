import type { WorkspaceRequest, WorkspaceSnapshot } from '../contract/index.js'
import { object } from './validation.js'
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
export class WorkspaceMetrics {
  readonly since = Date.now()
  detailed = false
  setDetailed(enabled: boolean) {
    this.detailed = enabled
    if (!enabled) {
      this.active.clear()
      this.observedStarts = false
    }
  }
  private rows: WorkspaceRequest[] = []
  private active = new Set<string>()
  private observedStarts = false
  event(name: string, raw: unknown): void {
    if (name !== 'api:request') return
    const event = object(raw),
      id = String(event['id'] ?? '')
    if (!id) return
    if (event['phase'] === 'started') {
      this.observedStarts = true
      this.active.add(id)
      return
    }
    if (event['phase'] !== 'finished') return
    this.active.delete(id)
    const observation = object(event['observation']),
      finish = object(event['finish'])
    const row: WorkspaceRequest = {
      id,
      model: String(observation['model_id'] ?? ''),
      endpoint: String(observation['endpoint'] ?? ''),
      status: number(observation['status'] ?? finish['status']),
      headers_ms: number(observation['latency_ms'] ?? finish['headers_ms']),
      duration_ms: number(finish['duration_ms']),
      ttft_ms: number(finish['ttft_ms']),
      completion_tokens: number(finish['completion_tokens']),
      tokens_estimated: finish['tokens_estimated'] === true,
      finished_at: number(event['finished_at_ms']) ?? Date.now(),
    }
    this.rows = [row, ...this.rows.filter((r) => r.id !== id)].slice(0, 1000)
  }
  snapshot(now = Date.now()): { metrics: WorkspaceSnapshot['metrics']; requests: WorkspaceRequest[] } {
    const rows = this.rows.filter((r) => now - r.finished_at <= 300000)
    const mean = (values: Array<number | null>) => {
      const found = values.filter((v): v is number => v !== null)
      return found.length ? found.reduce((a, b) => a + b, 0) / found.length : null
    }
    const timed = rows.filter(
      (r) =>
        r.completion_tokens !== null &&
        r.duration_ms !== null &&
        r.ttft_ms !== null &&
        r.duration_ms > r.ttft_ms
    )
    return {
      metrics: {
        detailed: this.detailed,
        header_latency_ms: mean(rows.map((r) => r.headers_ms ?? null)),
        window_ms: 300000,
        requests: rows.length,
        errors: rows.filter((r) => r.status !== null && r.status >= 400).length,
        active: this.observedStarts ? this.active.size : null,
        mean_latency_ms: mean(rows.map((r) => r.duration_ms)),
        mean_ttft_ms: mean(rows.map((r) => r.ttft_ms)),
        tokens_per_second: timed.length
          ? timed.reduce((s, r) => s + r.completion_tokens!, 0) /
            (timed.reduce((s, r) => s + r.duration_ms! - r.ttft_ms!, 0) / 1000)
          : null,
        since: this.since,
      },
      requests: rows.slice(0, 100),
    }
  }
}
