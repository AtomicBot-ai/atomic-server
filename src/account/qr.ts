/** A pairing link as a QR code: compact half-blocks for a terminal, SVG for the web admin. */
import { renderSVG, renderUnicodeCompact } from 'uqr'

/**
 * Two module rows per text line, light modules and the quiet zone drawn as blocks: right on the dark
 * background most terminals use, as `qrencode -t UTF8` does.
 */
export const qrTerminal = (text: string): string => renderUnicodeCompact(text, { border: 2 })

/** Black on white whatever the page theme: a phone camera needs the contrast. */
export const qrSvg = (text: string): string => renderSVG(text, { pixelSize: 6, border: 2 })
