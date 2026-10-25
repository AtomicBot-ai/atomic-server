/** Fill the body between paired ASCII edges, preserving the gaps between separate arms. */
export function contourSilhouette(lines: string[], solidRows: readonly number[] = []): boolean[][] {
  return lines.map((line, y) => {
    const mask = [...line].map((char) => char !== ' ')
    const edges = [...line].flatMap((char, x) => ("/\\|<>[].'".includes(char) ? [x] : []))
    if (solidRows.includes(y) && edges.length > 1) edges.splice(1, edges.length - 2)
    for (let i = 0; i + 1 < edges.length; i += 2)
      for (let x = edges[i]!; x <= edges[i + 1]!; x++) mask[x] = true
    return mask
  })
}
