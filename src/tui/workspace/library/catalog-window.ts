/** Window variable-height rows without reserving space for an expansion outside the viewport. */
export function catalogWindow(heights: number[], selected: number, room: number) {
  if (!heights.length) return { start: 0, count: 0 }
  const at = Math.max(0, Math.min(heights.length - 1, selected)),
    limit = Math.max(1, room)
  let start = at,
    used = heights[at]!
  while (start > 0 && used + heights[start - 1]! <= limit) used += heights[--start]!
  let end = at + 1
  // Include the final partially visible expansion. Its renderer clips to the viewport.
  while (end < heights.length && used < limit) used += heights[end++]!
  return { start, count: end - start }
}
