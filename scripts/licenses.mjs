// The license policy for what ships inside the binary: which SPDX expressions are allowed, and how a
// package's license is read. Pure; `gen-third-party-notices.mjs` does the file system.

/** Licenses compatible with shipping inside an Apache-2.0 binary without further obligations than a notice. */
export const ALLOWED = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BlueOak-1.0.0',
  '0BSD',
  'Unlicense',
  'CC0-1.0',
  'AFL-2.1',
  'Python-2.0',
  'CC-BY-4.0',
])

/** The license field of a package.json: a string, or the legacy `{ type }` and `licenses: [...]` forms. */
export function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type
  if (Array.isArray(pkg.licenses)) {
    const types = pkg.licenses.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean)
    if (types.length) return types.length === 1 ? types[0] : `(${types.join(' OR ')})`
  }
  return undefined
}

/**
 * Whether an SPDX expression may ship: every license of an AND, at least one of an OR. Parentheses
 * group; `WITH` exceptions are not accepted (none of the current dependencies uses one).
 */
export function allowed(expression) {
  if (typeof expression !== 'string' || expression.trim() === '') return false
  const tokens = expression.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim().split(/\s+/)
  let i = 0
  const parseOr = () => {
    let value = parseAnd()
    while (tokens[i] === 'OR') {
      i += 1
      const right = parseAnd()
      value = value || right
    }
    return value
  }
  const parseAnd = () => {
    let value = parseTerm()
    while (tokens[i] === 'AND') {
      i += 1
      const right = parseTerm()
      value = value && right
    }
    return value
  }
  const parseTerm = () => {
    const token = tokens[i]
    i += 1
    if (token === '(') {
      const value = parseOr()
      if (tokens[i] !== ')') throw new Error(`unbalanced parentheses in "${expression}"`)
      i += 1
      return value
    }
    if (token === undefined || token === ')' || token === 'AND' || token === 'OR' || token === 'WITH')
      throw new Error(`malformed license expression "${expression}"`)
    return ALLOWED.has(token.replace(/\+$/, ''))
  }
  try {
    const value = parseOr()
    if (i !== tokens.length) return false
    return value
  } catch {
    return false
  }
}
