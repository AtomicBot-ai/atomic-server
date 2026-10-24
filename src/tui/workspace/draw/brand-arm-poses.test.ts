import { expect, it } from 'vitest'
import { armPatches, paintArmPoses } from './brand-arm-poses.js'
import { LARGE_MARK, COMPACT_MARK } from './brand-mark.js'
import { contourSilhouette } from './brand-silhouette.js'

it.each([
  ['large', LARGE_MARK, [1, 4, 5, 6, 10, 11, 14], 7, 9, 6, 31],
  ['compact', COMPACT_MARK, [3, 7], 4, 6, 5, 22],
] as const)(
  'moves all eight %s tips visibly while preserving fixed body and attachment cells',
  (size, original, roots, bodyTop, bodyBottom, bodyLeft, bodyRight) => {
    const patches = armPatches(size)
    expect(patches).toHaveLength(8)
    const mask = contourSilhouette([...original], size === 'compact' ? [3, 4, 5, 6, 7] : [])
    for (let arm = 0; arm < 8; arm++) {
      for (const direction of [-1, 1]) {
        const poses = Array<number>(8).fill(0)
        poses[arm] = direction
        const result = paintArmPoses([...original], size, poses)
        expect(result).not.toEqual(original)
        expect(result.map((row) => row.length)).toEqual(original.map((row) => row.length))
        const movedMask = contourSilhouette(result, size === 'compact' ? [3, 4, 5, 6, 7] : [])
        for (const y of roots) expect(result[y]).toBe(original[y])
        for (let y = bodyTop; y <= bodyBottom; y++)
          expect(result[y]!.slice(bodyLeft, bodyRight + 1)).toBe(original[y]!.slice(bodyLeft, bodyRight + 1))
        const patch = patches[arm]!
        result.forEach((row, y) => {
          for (const [x, char] of [...row].entries()) {
            const inside =
              y >= patch.y &&
              y < patch.y + patch.rows.length &&
              x >= patch.x &&
              x < patch.x + patch.rows[0]!.length
            if (inside) continue
            expect(char, `fixed contour ${x},${y}, arm${arm}`).toBe(original[y]![x])
            expect(movedMask[y]![x], `fixed opaque body ${x},${y}, arm${arm}`).toBe(mask[y]![x])
          }
        })
      }
    }
  }
)

it.each([['large', LARGE_MARK, 18.5, 4, 16, 21]] as const)(
  'keeps the %s top cap equal-width and mirrored around its fixed stem',
  (size, lines, center, width, left, right) => {
    const caps = [-1, 1].map((direction) => {
      const result = paintArmPoses([...lines], size, [direction])
      const ink = [...result[0]!].flatMap((char, x) => (char === ' ' ? [] : [{ x, char }]))
      const cap = ink.filter(({ char }) => char === '_')
      expect(cap).toHaveLength(width)
      expect(cap.at(-1)!.x - cap[0]!.x + 1).toBe(width)
      expect(Math.abs((cap[0]!.x + cap.at(-1)!.x) / 2 - center)).toBe(1)
      expect(ink[0]).toEqual({ x: cap[0]!.x - 1, char: '/' })
      expect(ink.at(-1)).toEqual({ x: cap.at(-1)!.x + 1, char: '\\' })
      expect(result[1]!.slice(left, right + 1)).toBe(lines[1]!.slice(left, right + 1))
      return ink
    })
    expect(caps[0]).toEqual(
      caps[1]!
        .map(({ x, char }) => ({ x: center * 2 - x, char: char === '/' ? '\\' : char === '\\' ? '/' : char }))
        .reverse()
    )
  }
)

it.each([
  ['large', LARGE_MARK, 2, 7, 30, 2, 35, 13, 15],
  ['compact', COMPACT_MARK, 1, 4, 23, 1, 26, 9, 10],
] as const)(
  'bends every %s tip within its original outward reach',
  (size, lines, upperY, upperLeft, upperRight, sideLeft, sideRight, lowerY, bottomY) => {
    for (const [arm, patch] of armPatches(size).entries())
      for (const direction of [-1, 1]) {
        const poses = Array<number>(8).fill(0)
        poses[arm] = direction
        const result = paintArmPoses([...lines], size, poses)
        const points = patch.rows.flatMap((row, dy) =>
          [...row].flatMap((_, dx) =>
            result[patch.y + dy]![patch.x + dx] === ' ' ? [] : [{ x: patch.x + dx, y: patch.y + dy }]
          )
        )
        if (arm === 1 || arm === 2) expect(Math.min(...points.map((p) => p.y))).toBeGreaterThanOrEqual(upperY)
        if (arm === 1 || arm === 5)
          expect(Math.min(...points.map((p) => p.x))).toBeGreaterThanOrEqual(upperLeft)
        if (arm === 2 || arm === 7)
          expect(Math.max(...points.map((p) => p.x))).toBeLessThanOrEqual(upperRight)
        if (arm === 3) expect(Math.min(...points.map((p) => p.x))).toBeGreaterThanOrEqual(sideLeft)
        if (arm === 4) expect(Math.max(...points.map((p) => p.x))).toBeLessThanOrEqual(sideRight)
        if (arm === 5 || arm === 7) expect(Math.max(...points.map((p) => p.y))).toBeLessThanOrEqual(lowerY)
        if (arm === 6) expect(Math.max(...points.map((p) => p.y))).toBeLessThanOrEqual(bottomY)
      }
  }
)
