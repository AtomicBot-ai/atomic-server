import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { readArchive } from './archive.js'
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  processEntities: true,
  trimValues: false,
  parseTagValue: false,
})
type Xml = Record<string, unknown>[]
function xml(data: Uint8Array): Xml {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(data)
  if (/<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error('External entities and document types are not supported.')
  if (XMLValidator.validate(source) !== true) throw new Error('The document contains invalid XML.')
  return parser.parse(source) as Xml
}
function nodes(value: unknown, tag: string): Xml {
  if (!Array.isArray(value)) return []
  const result: Xml = []
  for (const node of value as Xml)
    for (const [key, child] of Object.entries(node)) {
      if (key === tag) result.push(node)
      else if (Array.isArray(child)) result.push(...nodes(child, tag))
    }
  return result
}
function text(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return (value as Xml)
    .map((node) =>
      Object.entries(node)
        .map(([key, child]) => (key === '#text' ? String(child) : Array.isArray(child) ? text(child) : ''))
        .join('')
    )
    .join('')
}
function paragraphs(data: Uint8Array, paragraph: string, leaf: string): string {
  return nodes(xml(data), paragraph)
    .map((p) =>
      nodes(p[paragraph], leaf)
        .map((v) => text(v[leaf]))
        .join('')
    )
    .join('\n')
}
/** Text from modern Office containers; embedded objects, macros and formulas are never executed. */
export function officeText(data: Uint8Array, extension: string): string {
  const files = readArchive(data)
  if (extension === 'docx') {
    const body = files.get('word/document.xml')
    if (!body) throw new Error('This is not a valid DOCX document.')
    return paragraphs(body, 'w:p', 'w:t')
  }
  if (extension === 'pptx') {
    const slides = [...files.keys()]
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    if (!slides.length) throw new Error('This presentation contains no slides.')
    return slides
      .map((name, i) => `Slide ${i + 1}\n${paragraphs(files.get(name)!, 'a:p', 'a:t')}`)
      .join('\n\n')
  }
  const shared = files.get('xl/sharedStrings.xml')
  const strings = shared
    ? nodes(xml(shared), 'si').map((s) =>
        nodes(s['si'], 't')
          .map((t) => text(t['t']))
          .join('')
      )
    : []
  const sheets = [...files.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!sheets.length) throw new Error('This workbook contains no worksheets.')
  return sheets
    .map(
      (name, i) =>
        `Sheet ${i + 1}\n` +
        nodes(xml(files.get(name)!), 'row')
          .map((row) =>
            nodes(row['row'], 'c')
              .map((cell) => {
                const attr = cell[':@'] as Record<string, string> | undefined
                const value = nodes(cell['c'], 'v')
                  .map((v) => text(v['v']))
                  .join('')
                return attr?.['@_t'] === 's'
                  ? (strings[Number(value)] ?? '')
                  : attr?.['@_t'] === 'inlineStr'
                    ? nodes(cell['c'], 't')
                        .map((v) => text(v['t']))
                        .join('')
                    : value
              })
              .join('\t')
          )
          .join('\n')
    )
    .join('\n\n')
}
