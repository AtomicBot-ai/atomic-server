export const INTRO_WAKE_SECONDS = 1.2

/** A one-time wake-up measured from this intro's mount, never from global uptime. */
export function introPupil(seconds: number, motion: boolean): 'X' | '-' | 'o' {
  if (!motion || seconds >= INTRO_WAKE_SECONDS) return 'o'
  return seconds < 0.7 ? 'X' : '-'
}
