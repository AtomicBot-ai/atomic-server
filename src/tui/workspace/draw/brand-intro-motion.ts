import type { BrandStatus } from './brand-mark.js'
import { INTRO_WAKE_SECONDS } from './brand-wake.js'
import { armPoses } from './brand-arm-timing.js'
import { paintArmPoses } from './brand-arm-poses.js'
import type { MarkSize } from './brand-arm-poses.js'

/** Every tip has its own irregular timing; the welcome face wakes before any arm moves. */
export function animatedIntroContour(
  lines: string[],
  size: MarkSize,
  seconds: number,
  motion: boolean,
  status: BrandStatus
): string[] {
  const elapsed = status === 'welcome' ? seconds - INTRO_WAKE_SECONDS : seconds
  return paintArmPoses(lines, size, armPoses(elapsed, motion, status))
}
