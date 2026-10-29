import { expect, it } from 'vitest'
import { readJson } from './bff-json.js'
const input = async function* (text: string) {
  yield Buffer.from(text)
}
it('parses streamed JSON and refuses invalid or oversized input', async () => {
  expect(await readJson(input('{"ok":true}'))).toEqual({ ok: true })
  expect(await readJson(input(''))).toBeUndefined()
  await expect(readJson(input('bad'))).rejects.toThrow('not valid JSON')
  await expect(readJson(input('{"ok":true}'), 2)).rejects.toThrow('too large')
})
