import { expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { documentText, readArchive, importSkillPackage, exportSkillPackage } from './index.js'
import { textPdf } from '../../test/helpers/pdf-document.js'
const office = (name: string, text: string) => zipSync({ [name]: strToU8(text) })
it('extracts selectable text from every PDF page without rendering or external workers', async () => {
  const text = await documentText('notes.pdf', textPdf(['First page', 'Second page']), 10)
  expect(text).toContain('First page')
  expect(text).toContain('Second page')
  await expect(documentText('bad.pdf', strToU8('broken PDF'), 10)).rejects.toThrow()
})
it('extracts DOCX paragraphs, shared and inline XLSX strings, and ordered PPTX slides', async () => {
  expect(
    await documentText(
      'notes.docx',
      office(
        'word/document.xml',
        '<w:document><w:body><w:p><w:r><w:t>Hello &amp; goodbye</w:t></w:r></w:p><w:p><w:r><w:t>001</w:t></w:r></w:p></w:body></w:document>'
      ),
      10
    )
  ).toBe('Hello & goodbye\n001')
  const sheet = zipSync({
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Revenue</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(
      '<worksheet><sheetData><row><c t="s"><v>0</v></c><c><f>2+3</f><v>5</v></c><c t="inlineStr"><is><t>001</t></is></c></row></sheetData></worksheet>'
    ),
  })
  expect(await documentText('report.xlsx', sheet, 10)).toBe('Sheet 1\nRevenue\t5\t001')
  const slides = zipSync({
    'ppt/slides/slide2.xml': strToU8('<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>'),
    'ppt/slides/slide1.xml': strToU8('<p:sld><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>'),
  })
  expect(await documentText('deck.pptx', slides, 10)).toBe('Slide 1\nFirst\n\nSlide 2\nSecond')
})
it('refuses unsupported binary documents, oversized files, entities and broken XML', async () => {
  await expect(documentText('old.doc', strToU8('bad'), 10)).rejects.toThrow('legacy')
  await expect(documentText('old.xls', strToU8('bad'), 10)).rejects.toThrow('legacy')
  await expect(documentText('large.txt', new Uint8Array(1024 * 1024 + 1), 1)).rejects.toThrow('smaller')
  await expect(documentText('bad.txt', new Uint8Array([0]), 10)).rejects.toThrow('binary')
  await expect(
    documentText(
      'xxe.docx',
      office('word/document.xml', '<!DOCTYPE doc [<!ENTITY x SYSTEM "file:///private">]><doc>&x;</doc>'),
      10
    )
  ).rejects.toThrow('entities')
  await expect(documentText('bad.docx', office('word/document.xml', '<w:document>'), 10)).rejects.toThrow(
    'invalid XML'
  )
})
it('bounds archive expansion, entry count, truncated streams and paths', () => {
  expect(() => readArchive(office('../escape', 'oops'))).toThrow('unsafe')
  expect(() => readArchive(office('/absolute', 'oops'))).toThrow('unsafe')
  expect(() => readArchive(office('C:\\evil', 'oops'))).toThrow('unsafe')
  expect(() => readArchive(new Uint8Array([1, 2, 3]))).toThrow()
  expect(() => readArchive(office('file', 'hello').slice(0, 33))).toThrow()
  expect(() => readArchive(office('file', 'hello').slice(0, -10))).toThrow('directory')
  expect(() =>
    readArchive(
      zipSync(Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`file${i}`, strToU8('x')])))
    )
  ).toThrow('too many')
  expect(() => readArchive(zipSync({ large: new Uint8Array(65 * 1024 * 1024) }))).toThrow('64 MB')
})
it('round-trips skill instructions and resources without writing or executing archive files', () => {
  const content = '---\nname: reviewer\ndescription: Reviews code\n---\nReview carefully.'
  const resources = {
    'scripts/check.py': Buffer.from('print("retained, never executed")').toString('base64'),
  }
  const data = exportSkillPackage(content, resources)
  expect(importSkillPackage(Buffer.from(data, 'base64'))).toEqual({ content, resources })
  expect(() => importSkillPackage(office('README.md', 'missing'))).toThrow('exactly one')
  expect(() =>
    importSkillPackage(zipSync({ 'a/SKILL.md': strToU8(content), 'b/SKILL.md': strToU8(content) }))
  ).toThrow('exactly one')
})
