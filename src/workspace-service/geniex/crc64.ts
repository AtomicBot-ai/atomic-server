// Reflected CRC-64/NVME, the full-object checksum S3 publishes for these multipart ZIPs.
// Split the 64-bit register into two words to avoid a BigInt allocation per input byte.
const high = new Uint32Array(256)
const low = new Uint32Array(256)
for (let index = 0; index < 256; index++) {
  let hi = 0,
    lo = index
  for (let bit = 0; bit < 8; bit++) {
    const carry = lo & 1
    lo = ((lo >>> 1) | (hi << 31)) ^ (carry ? 0xac4bc9b5 : 0)
    hi = (hi >>> 1) ^ (carry ? 0x9a6c9329 : 0)
  }
  high[index] = hi
  low[index] = lo
}
export class Crc64Nvme {
  private hi = 0xffffffff
  private lo = 0xffffffff
  update(bytes: Uint8Array) {
    let hi = this.hi,
      lo = this.lo
    for (let i = 0; i < bytes.length; i++) {
      const index = (lo ^ bytes[i]!) & 255
      lo = ((lo >>> 8) | (hi << 24)) ^ low[index]!
      hi = (hi >>> 8) ^ high[index]!
    }
    this.hi = hi
    this.lo = lo
  }
  hex() {
    return [~this.hi, ~this.lo].map((word) => (word >>> 0).toString(16).padStart(8, '0')).join('')
  }
}
