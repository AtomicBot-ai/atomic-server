import type { Canvas } from './canvas.js'
import { scrollTrack } from './controls.js'

/** Clip scrollable content and its hit targets to the same terminal viewport. */
export function drawViewport(
  c: Canvas,
  content: Canvas,
  x: number,
  y: number,
  width: number,
  height: number,
  scroll: number,
  focus: string
) {
  let offset = Math.max(0, Math.min(scroll, content.height - height))
  const target = content.targets.find((item) => item.id === focus)
  if (target && target.y < offset) offset = target.y
  if (target && target.y + target.height > offset + height) offset = target.y + target.height - height
  for (let row = 0; row < height; row++) {
    const cells = content.cells[row + offset]
    if (!cells) break
    for (let col = 0; col < width; col++)
      if (c.cells[y + row]?.[x + col] && cells[col]) c.cells[y + row]![x + col] = { ...cells[col]! }
  }
  for (const item of content.targets) {
    if (item.y < offset || item.y + item.height > offset + height) continue
    c.targets.push({ ...item, x: item.x + x, y: item.y + y - offset })
  }
  scrollTrack(c, x + width - 1, y, height, offset, height, content.height)
}
