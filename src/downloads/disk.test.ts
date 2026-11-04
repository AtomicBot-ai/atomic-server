// Lifted from atomic-chat-core/src/downloads/disk.test.ts @ 8a38521 (v0.17.0), FAT32 cases from 8cbab27 (v0.21.2); adapted: core contract types come from @atomic-chat/core/contracts; writes are checked by where they end.
import { describe, expect, it } from 'vitest'
import {
  checkFreeSpace,
  checkPathWithinLimit,
  classifyIoError,
  diskErrToString,
  diskFaultMessage,
  diskWriteErrToString,
  FAT32_MAX_FILE_BYTES,
  formatBytes,
  FREE_SPACE_HEADROOM,
  remainingBytes,
  writeFaultTag,
} from './disk.js'

const err = (code: string, message = `${code} happened`) => Object.assign(new Error(message), { code })

describe('classifyIoError / diskErrToString', () => {
  it.each([
    ['ENOSPC', 'disk_full'],
    ['EDQUOT', 'disk_full'],
    ['EFBIG', 'disk_fs_limit'],
    ['EACCES', 'disk_permission'],
    ['EROFS', 'disk_permission'],
    ['ETXTBSY', 'disk_file_locked'],
    ['EBUSY', 'disk_file_locked'],
    ['ENAMETOOLONG', 'disk_path_too_long'],
    ['ENODEV', 'disk_device_lost'],
    ['ENOENT', 'disk_device_lost'],
    ['EWHATEVER', 'disk_io'],
  ])('%s → %s', (code, tag) => expect(classifyIoError(err(code))).toBe(tag))
  it('handles non-errno errors and keeps the message body after the tag', () => {
    expect(classifyIoError(new Error('x'))).toBe('disk_io')
    expect(classifyIoError('str')).toBe('disk_io')
    expect(diskErrToString(err('ENOSPC', 'no space left on device'))).toBe(
      'Error: [disk_full] no space left on device'
    )
    expect(diskFaultMessage('disk_io', 'd')).toBe('Error: [disk_io] d')
  })
})

describe("FAT32's 4 GiB file limit", () => {
  const line = FAT32_MAX_FILE_BYTES
  it.each([
    ['a full disk while crossing the line', 'ENOSPC', line - 10, 64, 'disk_fs_limit'],
    ['an unnamed error while crossing it', 'EINVAL', line - 10, 64, 'disk_fs_limit'],
    ['a range written wholly past it', 'ENOSPC', line + 1024, 64, 'disk_fs_limit'],
    ['a full disk below it', 'ENOSPC', 1024, 64, 'disk_full'],
    ['a denial past it', 'EACCES', line + 1024, 64, 'disk_permission'],
    ['a lock past it', 'EBUSY', line + 1024, 64, 'disk_file_locked'],
    ['too large anywhere', 'EFBIG', 0, 64, 'disk_fs_limit'],
  ])('%s', (_name, code, offset, length, tag) => expect(writeFaultTag(err(code), offset, length)).toBe(tag))

  it('says what to do when the drive is the limit, and nothing more otherwise', () => {
    expect(diskWriteErrToString(err('EFBIG', 'EFBIG: file too large, write'), 0, 1)).toBe(
      'Error: [disk_fs_limit] EFBIG: file too large, write. This drive cannot store a file of 4 GB or more (FAT32). Move the data folder to an NTFS, exFAT or ext4 drive and retry.'
    )
    expect(diskWriteErrToString(err('ENOSPC', 'no space'), 0, 1)).toBe('Error: [disk_full] no space')
  })
})

describe('preflight helpers', () => {
  it('remainingBytes discounts partials and never underflows', () => {
    expect(remainingBytes(10_000, [4096])).toBe(10_000 - 4096)
    expect(remainingBytes(10_000, [])).toBe(10_000)
    expect(remainingBytes(1_000, [4096])).toBe(0)
  })
  it('formatBytes matches the Rust rendering', () => {
    expect(formatBytes(0)).toBe('1 MB')
    expect(formatBytes(700 * 1024 * 1024)).toBe('700 MB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB')
  })
  it('checkFreeSpace passes when nothing is needed, the volume is unknown, or there is room', () => {
    expect(checkFreeSpace(0, 0)).toBeUndefined()
    expect(checkFreeSpace(undefined, 10)).toBeUndefined()
    expect(checkFreeSpace(1024 + FREE_SPACE_HEADROOM, 1024)).toBeUndefined()
    expect(checkFreeSpace(1024, 1024)).toMatch(/^Error: \[disk_full\] Not enough free disk space/)
  })
  it('checkPathWithinLimit only bites on Windows and exempts verbatim paths', () => {
    const long = `C:\\${'x'.repeat(300)}\\model.gguf`
    expect(checkPathWithinLimit(long, 'win32')).toMatch(/^Error: \[disk_path_too_long\]/)
    expect(checkPathWithinLimit('C:\\jan\\model.gguf', 'win32')).toBeUndefined()
    expect(checkPathWithinLimit(`\\\\?\\${long}`, 'win32')).toBeUndefined()
    expect(checkPathWithinLimit(`/${'x'.repeat(300)}/model.gguf`, 'linux')).toBeUndefined()
  })
})
