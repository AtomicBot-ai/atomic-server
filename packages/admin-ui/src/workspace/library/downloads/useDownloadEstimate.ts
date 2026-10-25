import { useEffect, useState } from 'react'
import { downloadEta, downloadSpeed, nextTransferSample } from '@view'
import type { TransferSample } from '@view'

/** A download's speed and seconds left, sampled between renders as the terminal samples between polls. */
export function useDownloadEstimate(job: Record<string, unknown>) {
  const current = Number(job.transferred || 0),
    id = String(job.id ?? '')
  const [sample, setSample] = useState<TransferSample>(() =>
    nextTransferSample(undefined, id, current, Date.now())
  )
  useEffect(() => {
    setSample((previous) => nextTransferSample(previous, id, current, Date.now()))
  }, [id, current])
  const speed = downloadSpeed(job, sample.speed)
  return { speed, eta: downloadEta(job, speed) }
}
