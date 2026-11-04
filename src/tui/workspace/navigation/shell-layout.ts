import { brandHeaderRows } from '../draw/brand-header.js'
/** Desktop rail and context sidebar, with a drawer on compact terminals. */
export function shellLayout(width: number, height: number, top = brandHeaderRows(width, height)) {
  const rail = width < 90 ? 0 : 14,
    sidebar = width >= 110 && height >= 24 ? 24 : 0
  const x = rail + sidebar + 2
  return { rail, sidebar, x, y: top + (rail ? 0 : 2), width: width - x - 2, bottom: height - 4 }
}
