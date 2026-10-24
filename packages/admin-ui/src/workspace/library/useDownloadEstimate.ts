import { useEffect, useState } from 'react'
import { record } from '../types'

export function useDownloadEstimate(job: Record<string, unknown>) {
  const current = Number(job.transferred || 0),
    id = String(job.id ?? '')
  const [sample, setSample] = useState({ id, bytes: current, at: Date.now(), speed: 0 })
  useEffect(() => {
    const at = Date.now()
    setSample((previous) => {
      const elapsed = (at - previous.at) / 1000
      return {
        id,
        bytes: current,
        at,
        speed:
          previous.id === id && elapsed > 0 && current > previous.bytes
            ? (current - previous.bytes) / elapsed
            : previous.id === id
              ? previous.speed
              : 0,
      }
    })
  }, [id, current])
  const progress = record(job.progress),
    speed = Number(progress.bytes_per_second ?? job.bytes_per_second ?? sample.speed)
  const explicit = progress.eta_seconds ?? job.eta_seconds
  const milliseconds = progress.eta_ms ?? job.eta_ms ?? record(job.download).eta_ms
  const eta =
    explicit !== undefined
      ? Number(explicit)
      : milliseconds !== undefined
        ? Number(milliseconds) / 1000
        : speed > 0
          ? Math.max(0, Number(job.total) - current) / speed
          : undefined
  return { speed, eta }
}
