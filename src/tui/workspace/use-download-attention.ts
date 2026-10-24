import { useEffect, useState } from 'react'

/** Three bounded pulses after a blocked action; reduced motion uses a steady highlight. */
export function useDownloadAttention(request: number, motion: boolean) {
  const [phase, setPhase] = useState(6)
  useEffect(() => {
    if (!request) return
    setPhase(0)
    let tick = 0
    const timer = setInterval(() => {
      setPhase(++tick)
      if (tick >= 6) clearInterval(timer)
    }, 250)
    return () => clearInterval(timer)
  }, [request])
  return phase < 6 && (!motion || phase % 2 === 0)
}
