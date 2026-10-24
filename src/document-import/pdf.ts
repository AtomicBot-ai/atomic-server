// Text extraction uses PDF.js's in-process message handler, statically bundled with the binary.
// No canvas, rendering, external worker file, font fetch or native addon is required.
import 'pdfjs-dist/build/pdf.worker.mjs'
import { getDocument } from 'pdfjs-dist'
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    useWorkerFetch: false,
    disableFontFace: true,
    isOffscreenCanvasSupported: false,
    verbosity: 0,
    stopAtErrors: true,
  })
  const timer = setTimeout(() => {
    void task.destroy()
  }, 30000)
  try {
    const document = await task.promise
    if (document.numPages > 1000) throw new Error('Choose a PDF with at most 1,000 pages.')
    const pages: string[] = []
    let length = 0
    for (let page = 1; page <= document.numPages; page++) {
      const source = await document.getPage(page)
      const content = await source.getTextContent()
      const value = content.items
        .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .trim()
      length += value.length
      if (length > 16000000) throw new Error('The extracted PDF text is too large.')
      pages.push(value)
      source.cleanup()
    }
    const result = pages.join('\n\n').trim()
    if (!result) throw new Error('This PDF has no selectable text. Run OCR before attaching it.')
    return result
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException')
      throw new Error('Unlock this PDF before attaching it.')
    throw error
  } finally {
    clearTimeout(timer)
    await task.destroy()
  }
}
