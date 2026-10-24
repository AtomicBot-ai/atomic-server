import { canvas } from './draw/canvas.js'
import { drawIntroBrand } from './draw/brand-intro.js'

export function introArt(
  width: number,
  height: number,
  seconds = 0,
  motion = true,
  prompt = 'Press any key'
): string[] {
  const c = canvas(Math.max(1, width), Math.max(1, height))
  drawIntroBrand(c, seconds, motion, prompt)
  return c.cells.map((row) => row.map((cell) => cell.char).join(''))
}

/** Mouse hover, wheel and terminal reports must not dismiss the intro. */
export function introInput(
  input: string,
  key: {
    ctrl?: boolean
    return?: boolean
    escape?: boolean
    tab?: boolean
    upArrow?: boolean
    downArrow?: boolean
    leftArrow?: boolean
    rightArrow?: boolean
    shift?: boolean
    meta?: boolean
    eventType?: 'press' | 'repeat' | 'release'
  }
) {
  if (key.ctrl && ['c', 'q'].includes(input)) return 'quit'
  // eslint-disable-next-line no-control-regex
  if (/^(?:\u001b)?\[</.test(input)) {
    const mouse = /\[<(\d+);\d+;\d+M$/.exec(input)
    return mouse && (Number(mouse[1]) & 127) === 0 ? 'continue' : 'ignore'
  }
  // Terminal capability, focus, cursor and color reports are not user keystrokes.
  // Ink decodes actual navigation keys before calling this function.
  if (input.includes('\u001b') || [...input].length > 1) return 'ignore'
  if (key.ctrl || key.meta || key.eventType === 'repeat' || key.eventType === 'release') return 'ignore'
  const pressed = Object.entries(key).some(
    ([name, value]) =>
      value === true && !['shift', 'ctrl', 'meta', 'super', 'hyper', 'capsLock', 'numLock'].includes(name)
  )
  // Multi-character input is a paste or an undecoded report, never "any key".
  return [...input].length === 1 || pressed ? 'continue' : 'ignore'
}
