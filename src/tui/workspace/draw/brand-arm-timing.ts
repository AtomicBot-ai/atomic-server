import type { BrandStatus } from './brand-mark.js'

const periods = [2.1, 2.9, 2.35, 3.2, 2.65, 3.45, 2.55, 3.05]
function noise(arm: number, cycle: number, salt: number) {
  const value = Math.sin((arm + 1) * 127.1 + (cycle + 1) * 311.7 + salt * 74.7) * 43758.5453
  return value - Math.floor(value)
}

/** Independent deterministic timings avoid synchronized breathing or global translations. */
export function armPoses(seconds: number, motion: boolean, status: BrandStatus, subtle = false): number[] {
  if (!motion || status === 'stopped' || status === 'error' || seconds < 0) return Array<number>(8).fill(0)
  return periods.map((base, arm) => {
    const period = subtle ? base * 3 : base
    const cycle = Math.floor(seconds / period)
    const phase = seconds - cycle * period
    const duration = subtle ? 0.45 : 0.4 + noise(arm, cycle, 2) * 0.35
    const start = 0.25 + noise(arm, cycle, 1) * (period - duration - 0.5)
    return phase >= start && phase < start + duration ? (noise(arm, cycle, 3) < 0.5 ? -1 : 1) : 0
  })
}
