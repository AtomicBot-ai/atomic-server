import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { runAtcAsync as runAtc } from '../helpers/async-binary.js'
import { textPdf } from '../helpers/pdf-document.js'
const dir = mkdtempSync(join(tmpdir(), 'atc-document-binary-'))
const call = (name: string, input: Record<string, unknown>) =>
  runAtc(['--data-folder', dir, 'control', 'call', name, '--input', JSON.stringify(input), '--json'])
afterAll(async () => {
  await runAtc(['--data-folder', dir, 'stop', '--force', '--kill'])
  rmSync(dir, { recursive: true, force: true })
})
it('uses the packaged server binary to extract PDFs and persist portable skills', async () => {
  const start = await runAtc(['--data-folder', dir, 'start', '--admin-port', '0', '--json'])
  expect(start.code, start.err).toBe(0)
  const document = await call('attachments.parse', {
    name: 'proof.pdf',
    data: Buffer.from(textPdf(['Bundled PDF extraction'])).toString('base64'),
  })
  expect(document.code, document.err).toBe(0)
  expect(JSON.parse(document.out).result.content).toBe('Bundled PDF extraction')
  const imported = await call('skills.import', {
    content: '---\nname: proof\ndescription: Packaged skill\n---\nInstructions',
  })
  expect(imported.code, imported.err).toBe(0)
  const exported = await call('skills.export', { id: 'proof' })
  expect(exported.code, exported.err).toBe(0)
  expect(JSON.parse(exported.out).result.name).toBe('proof.skill')
  expect((await call('skills.remove', { id: 'proof' })).code).toBe(0)
  const reimported = await call('skills.import', { data: JSON.parse(exported.out).result.data })
  expect(reimported.code, reimported.err).toBe(0)
  expect(JSON.parse(reimported.out).result.skills[0].body).toContain('Instructions')
})
