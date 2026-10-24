import { expect, it } from 'vitest'
import { canvas, COLORS } from './canvas.js'
import { atomicHeader, brandHeaderRows } from './brand-header.js'
import { brandStatus, BRAND_COLORS, drawBrandMark } from './brand-mark.js'
import { INTRO_WORDMARK, SERVER_WORDMARK } from './brand-lettering.js'
import { introCanvas } from '../intro-canvas.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'

it.each([
  [undefined, 'welcome'],
  ['offline', 'stopped'],
  ['starting', 'starting'],
  ['ready', 'running'],
  ['busy', 'running'],
  ['overloaded', 'error'],
  ['error', 'error'],
] as const)('uses the shared %s server state for %s eyes', (eye, expected) => {
  expect(brandStatus(eye)).toBe(expected)
})

it.each(['large', 'compact', 'header', 'small'] as const)(
  'keeps %s eyes inside a printable ASCII mark and uses meaningful status colors',
  (size) => {
    const draw = (status: Parameters<typeof drawBrandMark>[4], time = 0, motion = true) => {
      const c = canvas(40, 20)
      drawBrandMark(c, 0, 0, size, status, time, motion)
      return c.cells.flat().filter((cell) => cell.char.trim())
    }
    for (const cell of draw('welcome')) expect(cell.char).toMatch(/^[ -~]$/)
    expect(draw('welcome').every((cell) => cell.color === COLORS.text)).toBe(true)
    expect(
      draw('running')
        .filter((cell) => cell.color === BRAND_COLORS.running)
        .map((cell) => cell.char)
    ).toEqual(['o', 'o'])
    expect(
      draw('stopped')
        .filter((cell) => cell.color === BRAND_COLORS.stopped)
        .map((cell) => cell.char)
    ).toEqual(['X', 'X'])
    expect(draw('error').every((cell) => cell.color === BRAND_COLORS.error)).toBe(true)
    expect(
      draw('starting', 0.5)
        .filter((cell) => cell.color === BRAND_COLORS.starting)
        .map((cell) => cell.char)
    ).toEqual(['-', '-'])
    expect(draw('starting', 0, false)).toEqual(draw('starting', 0.5, false))
    expect(draw('welcome', 0)).not.toEqual(draw('welcome', 5.8))
    expect(draw('welcome', 0, false)).toEqual(draw('welcome', 5.8, false))
    expect(
      draw('running', 5.8)
        .filter((cell) => cell.color === BRAND_COLORS.running)
        .map((cell) => cell.char)
    ).toEqual(['-', '-'])
    expect(draw('running', 6)).toEqual(draw('running', 0))
    expect(draw('running', 5.8, false)).toEqual(draw('running', 0, false))
    expect(draw('stopped', 5.8)).toEqual(draw('stopped', 0))
  }
)

it.each([
  [54, 24],
  [80, 24],
  [100, 30],
  [120, 36],
  [180, 56],
])('reserves the complete white header and visible controls at %s×%s', (width, height) => {
  const c = canvas(width!, height!)
  atomicHeader(c, 'error')
  const headerRows = brandHeaderRows(width!, height!)
  expect(c.cells[0]!.every((cell) => cell.char === ' ')).toBe(true)
  expect(c.cells[4]!.some((cell) => cell.char.trim())).toBe(true)
  if (headerRows === 6) expect(c.cells[5]!.every((cell) => cell.char === ' ')).toBe(true)
  expect(c.cells[headerRows]!.every((cell) => cell.char === ' ')).toBe(true)
  const title = headerRows === 6 ? SERVER_WORDMARK : ['/ ATOMIC SERVER /']
  for (const row of title)
    expect(c.cells.map((line) => line.map((cell) => cell.char).join('')).join('\n')).toContain(row.trimEnd())
  const white = c.cells.flat().filter((cell) => cell.char.trim() && cell.color === COLORS.text)
  expect(white.length).toBeGreaterThan(10)
  expect(
    c.cells.flatMap((row, y) =>
      row.some((cell) => cell.char.trim() && cell.color === COLORS.text) ? [y] : []
    )
  ).toEqual(headerRows === 6 ? [1, 2, 3, 4] : [3])
  expect(c.cells[3]!.map((cell) => cell.char).join('')).toContain('[_  (o)(o) _]')
  for (const page of ['server', 'chat', 'models', 'access', 'welcome'] as const) {
    const f = workspaceFrame(createWorkspace(page), width!, height!, 0)
    expect(f.targets.every((target) => target.y >= headerRows)).toBe(true)
    const expected = canvas(width!, height!)
    atomicHeader(expected)
    expect(f.cells.slice(0, headerRows)).toEqual(expected.cells.slice(0, headerRows))
  }
})

it('uses the approved uppercase SmSlant wordmark with a real gap above the intro action', () => {
  const c = introCanvas(120, 36, 0, false, 'Choose engine')
  const lines = c.cells.map((row) => row.map((cell) => cell.char).join(''))
  for (const line of INTRO_WORDMARK) expect(lines.join('\n')).toContain(line.trimEnd())
  const action = c.targets.find((target) => target.id === 'intro-continue')!
  for (const row of lines.slice(action.y - 3, action.y)) expect(row.trim()).toBe('')
  expect(lines.join('\n')).toContain('(o) (o)')
})

it.each(['header', 'small'] as const)(
  'keeps the exact 13-column %s outline and adjacent status eyes',
  (size) => {
    const expected = ['  ___ _ ___  ', ' _\\ \\| |/ /_ ', '[_  (o)(o) _]', '  / /| |\\ \\  ']
    for (const status of ['running', 'starting', 'stopped', 'error'] as const) {
      const c = canvas(20, 8)
      drawBrandMark(c, 2, 1, size, status, 0.5)
      const pupil = status === 'stopped' ? 'X' : status === 'starting' ? '-' : 'o'
      expect(
        c.cells.slice(1, 5).map((row) =>
          row
            .slice(2, 15)
            .map((cell) => cell.char)
            .join('')
        )
      ).toEqual(expected.map((row) => row.replaceAll('(o)', `(${pupil})`)))
      expect(c.cells.every((row) => row.slice(15).every((cell) => cell.char === ' '))).toBe(true)
      for (const x of [7, 10]) expect(c.cells[3]![x]!.char).toBe(pupil)
    }
  }
)

it('centers the shared compact mark in a narrow intro without preserving its former width', () => {
  const c = introCanvas(40, 20, 0, false, 'Choose engine')
  const row = c.cells[3]!.map((cell) => cell.char).join('')
  expect(row.indexOf('[_  (o)(o) _]')).toBe(13)
})
