import type { BrandStatus } from './brand-mark.js'
import { armPoses } from './brand-arm-timing.js'
import { paintArmPoses } from './brand-arm-poses.js'

/** Apply bounded contour patches; the literal header shapes remain unchanged. */
export function animatedContour(
  lines: string[],
  center: number,
  seconds: number,
  motion: boolean,
  status: BrandStatus
): string[] {
  const size =
    lines.length === 16 ? 'large' : lines.length === 11 ? 'compact' : center > 10 ? 'header' : 'small'
  return paintArmPoses(lines, size, armPoses(seconds, motion, status, true))
}
