import type { Canvas } from './draw/canvas.js'
/** SGR reports are recognized before editor input; their bytes can never become chat text. */
export function mouseReport(
  input: string
): { code: number; x: number; y: number; released: boolean } | undefined {
  // eslint-disable-next-line no-control-regex
  const m = /^(?:\u001b)?\[<(\d+);(\d+);(\d+)([Mm])$/.exec(input)
  return m
    ? { code: Number(m[1]), x: Number(m[2]) - 1, y: Number(m[3]) - 1, released: m[4] === 'm' }
    : undefined
}

export function outsidePopover(frame: Canvas, point: { x: number; y: number }): boolean {
  const p = frame.popover
  return Boolean(
    p && (point.x < p.x || point.x >= p.x + p.width || point.y < p.y || point.y >= p.y + p.height)
  )
}
