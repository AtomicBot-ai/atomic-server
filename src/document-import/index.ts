/** Bounded text extraction and portable skill archives shared by Web uploads and terminal files. */
import { officeText } from './office.js'
export { readArchive } from './archive.js'
export { importSkillPackage, exportSkillPackage } from './skills.js'
export const DOCUMENT_EXTENSIONS = [
  'txt',
  'md',
  'csv',
  'json',
  'log',
  'py',
  'js',
  'ts',
  'html',
  'css',
  'xml',
  'yaml',
  'yml',
  'pdf',
  'docx',
  'xlsx',
  'pptx',
]
export async function documentText(name: string, bytes: Uint8Array, maximumMb: number): Promise<string> {
  if (!Number.isFinite(maximumMb) || maximumMb < 1 || maximumMb > 100)
    throw new Error('Choose a file size limit between 1 and 100 MB.')
  if (bytes.length > maximumMb * 1024 * 1024)
    throw new Error(`Choose a document smaller than ${maximumMb} MB.`)
  const extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  if (!DOCUMENT_EXTENSIONS.includes(extension))
    throw new Error('Choose PDF, DOCX, XLSX, PPTX or a text document. Convert legacy Office files first.')
  const content =
    extension === 'pdf'
      ? await (await import('./pdf.js')).pdfText(bytes)
      : ['docx', 'xlsx', 'pptx'].includes(extension)
        ? officeText(bytes, extension)
        : new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  if (content.includes('\0')) throw new Error('This document contains binary data.')
  if (Buffer.byteLength(content) > 16 * 1024 * 1024)
    throw new Error('The extracted document text exceeds 16 MB.')
  return content
}
