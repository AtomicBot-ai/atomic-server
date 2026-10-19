import { useEffect, useState } from 'react'
export type EyeState = 'stopped' | 'starting' | 'ready' | 'busy' | 'overloaded' | 'error' | 'disconnected'
const COLORS = ['#112825', '#17433e', '#23685e', '#389b88', '#5bc5b2', '#9fe8d9', '#ddfff4']
function frame(phase: number, state: EyeState) {
  const lines = []
  const closed = state === 'stopped' || state === 'disconnected'
  for (let y = 0; y < 17; y++) {
    const line = []
    for (let x = 0; x < 41; x++) {
      const nx = (x - 20) / 20,
        ny = (y - 8) / (closed ? 1.8 : 8)
      const distance = Math.hypot(nx, ny)
      const gaze = Math.sin(phase / 8) * (state === 'starting' ? 0.16 : 0.07)
      const pupil = ((nx - gaze) / 0.28) ** 2 + (ny / 0.83) ** 2
      const wave = Math.sin(x * 1.4 + y * 0.85 + phase * 0.28)
      const level = Math.min(6, Math.max(0, Math.floor((1 - distance) * 8 + wave * 1.4)))
      const visible = distance < 1 && pupil > 1
      line.push(
        <span key={x} style={{ color: visible ? COLORS[level] : 'transparent' }}>
          {visible ? '.:;+*#@'[level] : ' '}
        </span>
      )
    }
    lines.push(
      <span className="eye-row" key={y}>
        {line}
      </span>
    )
  }
  return lines
}
export function Eye({ state, motion = true }: { state: EyeState; motion?: boolean }) {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!motion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(
      () => setPhase((p) => p + 1),
      state === 'starting' || state === 'overloaded' ? 90 : 220
    )
    return () => clearInterval(timer)
  }, [motion, state])
  return (
    <div className={`server-eye eye-${state}`} role="img" aria-label={`Server ${state}`}>
      <pre aria-hidden>{frame(phase, state)}</pre>
    </div>
  )
}
