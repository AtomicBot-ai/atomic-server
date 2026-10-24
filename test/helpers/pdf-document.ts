/** Small valid PDF fixture with selectable text, no font or network dependencies. */
export function textPdf(pages: string[]): Uint8Array {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '']
  const kids: string[] = []
  for (const value of pages) {
    const number = objects.length + 1
    kids.push(`${number} 0 R`)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${number + 1} 0 R >>`
    )
    const stream = `BT /F1 12 Tf 20 250 Td (${value.replace(/[()\\]/g, '\\$&')}) Tj ET`
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, value] of objects.entries()) {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${value}\nendobj\n`
  }
  const start = pdf.length
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`
  pdf += offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
  return new TextEncoder().encode(pdf)
}
