import { brandHeaderRows } from './draw/brand-header.js'
/** Desktop rail and context sidebar, with a drawer on compact terminals. */
export function shellLayout(width: number, height: number, top = brandHeaderRows(width, height)) {
  const rail = 14,
    sidebar = width >= 80 && height >= 24 ? 24 : 0
  const x = rail + sidebar + 2
  return { rail, sidebar, x, y: top, width: width - x - 2, bottom: height - 4 }
}
