/** Downscale locally before upload; no image is sent to an external service. */
export async function attachmentImage(file: File, maximum: number): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read image.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
  if (!maximum) return source
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image()
    value.onload = () => resolve(value)
    value.onerror = () => reject(new Error('Could not decode image.'))
    value.src = source
  })
  const scale = Math.min(1, maximum / Math.max(image.width, image.height))
  if (scale === 1) return source
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx)
    throw new Error('Image resizing is unavailable in this browser. Choose Original in Attachment settings.')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}
