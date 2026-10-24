import { Text } from 'ink'
import { COLORS } from './canvas.js'
import type { Cell } from './canvas.js'
const lightSurfaces = new Set<string>([
  COLORS.text,
  COLORS.composer,
  COLORS.composerFrame,
  COLORS.modelButton,
  COLORS.sendButton,
  COLORS.gold,
])
export function CanvasRow({
  cells,
  color,
  trueColor,
}: {
  cells: Cell[]
  color: boolean
  trueColor: boolean
}) {
  const runs: { text: string; color: string; background: string | undefined; bold: boolean | undefined }[] =
    []
  for (const c of cells) {
    const last = runs.at(-1)
    if (last && last.color === c.color && last.background === c.background && last.bold === c.bold)
      last.text += c.char
    else runs.push({ text: c.char, color: c.color, background: c.background, bold: c.bold })
  }
  return (
    <Text {...(color && trueColor ? { backgroundColor: COLORS.ground } : {})}>
      {runs.map((r, i) => (
        <Text
          key={i}
          bold={r.bold === true}
          {...(color
            ? {
                color: trueColor
                  ? r.color
                  : lightSurfaces.has(r.background ?? '')
                    ? 'white'
                    : r.color === COLORS.gold
                      ? 'cyan'
                      : r.color === COLORS.ground
                        ? 'black'
                        : r.color === COLORS.text
                          ? 'white'
                          : r.color === COLORS.green
                            ? 'cyan'
                            : r.color === COLORS.muted || r.color === COLORS.line || r.color === COLORS.stone
                              ? 'gray'
                              : 'cyan',
              }
            : {})}
          {...(color && trueColor && r.background ? { backgroundColor: r.background } : {})}
          inverse={
            (!color || !trueColor) && (lightSurfaces.has(r.background ?? '') || r.background === COLORS.focus)
          }
        >
          {r.text}
        </Text>
      ))}
    </Text>
  )
}
