import { expect, it } from 'vitest'
import { documentText, exportSkillPackage, importSkillPackage } from '../../src/document-import/index.js'
import { textPdf } from '../helpers/pdf-document.js'
it('extracts PDF text and portable skills without native rendering or external workers', async () => {
  expect(await documentText('proof.pdf', textPdf(['Runtime-compatible PDF text']), 10)).toBe(
    'Runtime-compatible PDF text'
  )
  const content = '---\nname: proof\n---\nInstructions'
  expect(importSkillPackage(Buffer.from(exportSkillPackage(content), 'base64')).content).toBe(content)
})
