/** Turn filesystem errors from model import into the same actionable message in both clients. */
export function modelImportError(error: unknown, fallback?: string): string {
  const row = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {}
  const message = typeof row.message === 'string' ? row.message : typeof error === 'string' ? error : ''
  const detail = `${String(row.code ?? '')} ${message}`
  if (/\b(?:ENOENT|ENOTDIR)\b/.test(detail))
    return 'Model file not found. Check the path on this server and try again.'
  if (/\b(?:EACCES|EPERM)\b/.test(detail))
    return 'The server cannot read this file. Choose a readable file or update its permissions.'
  if (/\bEISDIR\b/.test(detail)) return 'Choose a .gguf file, not a folder.'
  return fallback || message || 'Could not import this model. Try again.'
}
