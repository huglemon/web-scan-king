export type ZipDataUrlFile = {
  name: string
  dataUrl: string
}

const textEncoder = new TextEncoder()
const CRC_TABLE = createCrcTable()

export function createZipFromDataUrls(files: ZipDataUrlFile[]) {
  if (files.length === 0) {
    throw new Error('没有可导出的图片')
  }

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const fileNameBytes = textEncoder.encode(file.name)
    const dataBytes = dataUrlToBytes(file.dataUrl)
    const crc = calculateCrc32(dataBytes)
    const localHeader = createLocalHeader(fileNameBytes, dataBytes.length, crc)
    const centralHeader = createCentralHeader(
      fileNameBytes,
      dataBytes.length,
      crc,
      offset,
    )

    localParts.push(localHeader, fileNameBytes, dataBytes)
    centralParts.push(centralHeader, fileNameBytes)
    offset += localHeader.length + fileNameBytes.length + dataBytes.length
  }

  const centralOffset = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const endRecord = createEndRecord(files.length, centralSize, centralOffset)

  const blobParts = [...localParts, ...centralParts, endRecord].map(
    toArrayBuffer,
  )

  return new Blob(blobParts, { type: 'application/zip' })
}

function dataUrlToBytes(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(',')

  if (commaIndex < 0) {
    throw new Error('图片数据格式不正确')
  }

  const metadata = dataUrl.slice(0, commaIndex)
  const body = dataUrl.slice(commaIndex + 1)

  if (!metadata.includes(';base64')) {
    return textEncoder.encode(decodeURIComponent(body))
  }

  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function createLocalHeader(
  fileNameBytes: Uint8Array,
  size: number,
  crc: number,
) {
  const header = new Uint8Array(30)
  const view = new DataView(header.buffer)

  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 0x0800, true)
  view.setUint16(8, 0, true)
  view.setUint32(10, getDosDateTime(), true)
  view.setUint32(14, crc, true)
  view.setUint32(18, size, true)
  view.setUint32(22, size, true)
  view.setUint16(26, fileNameBytes.length, true)
  view.setUint16(28, 0, true)

  return header
}

function createCentralHeader(
  fileNameBytes: Uint8Array,
  size: number,
  crc: number,
  offset: number,
) {
  const header = new Uint8Array(46)
  const view = new DataView(header.buffer)

  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, 0x0800, true)
  view.setUint16(10, 0, true)
  view.setUint32(12, getDosDateTime(), true)
  view.setUint32(16, crc, true)
  view.setUint32(20, size, true)
  view.setUint32(24, size, true)
  view.setUint16(28, fileNameBytes.length, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, offset, true)

  return header
}

function createEndRecord(
  fileCount: number,
  centralSize: number,
  centralOffset: number,
) {
  const header = new Uint8Array(22)
  const view = new DataView(header.buffer)

  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, fileCount, true)
  view.setUint16(10, fileCount, true)
  view.setUint32(12, centralSize, true)
  view.setUint32(16, centralOffset, true)
  view.setUint16(20, 0, true)

  return header
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980)
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2)
  const dosDate =
    ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()

  return ((dosDate << 16) | dosTime) >>> 0
}

function calculateCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)

  new Uint8Array(buffer).set(bytes)

  return buffer
}

function createCrcTable() {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let crc = index

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }

    table[index] = crc >>> 0
  }

  return table
}
