import { describe, expect, it } from 'vitest'
import { recordingIo } from '../io.js'
import { createPrompter } from './prompt.js'

describe('prompter', () => {
  it('needs --yes without a terminal, for safe and dangerous questions alike', async () => {
    const io = recordingIo()
    await expect(createPrompter(io, { yes: false, json: false }).confirm('Install?')).rejects.toMatchObject({
      code: 'ATC_CONSENT_REQUIRED',
    })
    const yes = createPrompter(io, { yes: true, json: false })
    expect(await yes.confirm('Install?')).toBe(true)
    expect(await yes.confirm('Delete?', { danger: true })).toBe(true)
  })

  it('asks on a terminal and reads y/n with the default', async () => {
    const io = recordingIo({ isTTY: { stdin: true, stdout: true, stderr: true }, answers: ['', 'n', 'YES'] })
    const p = createPrompter(io, { yes: false, json: false })
    expect(await p.confirm('A?', { defaultYes: true })).toBe(true)
    expect(await p.confirm('B?')).toBe(false)
    expect(await p.confirm('C?')).toBe(true)
  })
})
