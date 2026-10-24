import { expect, it } from 'vitest'
import { modelImportError } from './model-import-error.js'

it.each(['ENOENT', 'ENOTDIR'])('explains a missing import path (%s)', (code) => {
  expect(modelImportError(new Error(`${code}: no such file or directory, open '/missing.gguf'`))).toBe(
    'Model file not found. Check the path on this server and try again.'
  )
})
it.each(['EACCES', 'EPERM'])('explains unreadable files from a structured error (%s)', (code) => {
  expect(modelImportError({ code, message: 'Access denied' })).toBe(
    'The server cannot read this file. Choose a readable file or update its permissions.'
  )
})
it('recognizes filesystem text returned by the server and preserves other meaningful errors', () => {
  expect(modelImportError('EISDIR: illegal operation on a directory')).toBe(
    'Choose a .gguf file, not a folder.'
  )
  expect(modelImportError(new Error('Invalid GGUF header.'))).toBe('Invalid GGUF header.')
  expect(modelImportError(new Error('Invalid model'), 'Invalid model — choose a compatible GGUF.')).toBe(
    'Invalid model — choose a compatible GGUF.'
  )
})
