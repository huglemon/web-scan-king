import { describe, expect, it } from 'vitest'
import { createZipFromDataUrls } from './zip'

describe('zip exports', () => {
  it('creates a readable zip container from image data urls', async () => {
    const blob = createZipFromDataUrls([
      {
        name: '扫描页 1.jpg',
        dataUrl: `data:image/jpeg;base64,${btoa('image-bytes')}`,
      },
    ])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)
    const fileName = new TextEncoder().encode('扫描页 1.jpg')
    const localFileNameLength = view.getUint16(26, true)
    const dataStart = 30 + localFileNameLength

    expect(blob.type).toBe('application/zip')
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(localFileNameLength).toBe(fileName.length)
    expect([...bytes.slice(30, dataStart)]).toEqual([...fileName])
    expect(new TextDecoder().decode(bytes.slice(dataStart, dataStart + 11))).toBe(
      'image-bytes',
    )
    expect(findSignature(bytes, [0x50, 0x4b, 0x01, 0x02])).toBeGreaterThan(0)
    expect(findSignature(bytes, [0x50, 0x4b, 0x05, 0x06])).toBeGreaterThan(0)
  })

  it('requires at least one file', () => {
    expect(() => createZipFromDataUrls([])).toThrow('没有可导出的图片')
  })
})

function findSignature(bytes: Uint8Array, signature: number[]) {
  return bytes.findIndex((_, index) =>
    signature.every((part, offset) => bytes[index + offset] === part),
  )
}
