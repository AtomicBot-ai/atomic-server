/** Speed and time left of a download, the same in the web admin and the terminal UI. */

type Row = Record<string, unknown>
const record = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}

export interface TransferSample {
  id: string
  bytes: number
  at: number
  speed: number
}

/** The next sample of a download's bytes: a speed only between two samples of the same download, a second or more apart, that moved. */
export function nextTransferSample(
  previous: TransferSample | undefined,
  id: string,
  bytes: number,
  now: number
): TransferSample {
  const elapsed = previous ? (now - previous.at) / 1000 : 0
  // Two renders a moment apart would make a spike: a speed needs a second between samples.
  if (previous?.id === id && elapsed < 1) return previous
  const speed =
    previous?.id === id && elapsed > 0 && bytes > previous.bytes ? (bytes - previous.bytes) / elapsed : 0
  return { id, bytes, at: now, speed }
}

/** Bytes per second: what the server reports, else the sampled speed. */
export function downloadSpeed(row: Row, sampled: number): number {
  return Number(record(row['progress'])['bytes_per_second'] ?? row['bytes_per_second'] ?? sampled)
}

/** Seconds left: the server's own estimate, else what is left at `speed`; undefined while unknown. */
export function downloadEta(row: Row, speed: number): number | undefined {
  const progress = record(row['progress'])
  const seconds = progress['eta_seconds'] ?? row['eta_seconds']
  if (seconds !== undefined && seconds !== null) return Number(seconds)
  const ms = progress['eta_ms'] ?? row['eta_ms'] ?? record(row['download'])['eta_ms']
  if (ms !== undefined && ms !== null) return Number(ms) / 1000
  const total = Number(row['total'] ?? 0),
    done = Number(row['transferred'] ?? 0)
  return speed > 0 && total > 0 ? Math.max(0, total - done) / speed : undefined
}

export function formatEta(seconds: number): string {
  return seconds < 60 ? `${Math.max(1, Math.ceil(seconds))} sec` : `${Math.ceil(seconds / 60)} min`
}
