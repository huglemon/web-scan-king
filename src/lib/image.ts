export type ScanFilterId = 'original' | 'clean' | 'gray' | 'contrast' | 'mono'

export type ScanFilterPreset = {
  id: ScanFilterId
  label: string
  description: string
  canvasFilter: string
}

export type RenderedImage = {
  dataUrl: string
  width: number
  height: number
}

export const FILTER_PRESETS: ScanFilterPreset[] = [
  {
    id: 'original',
    label: '原图',
    description: '保留拍摄色彩',
    canvasFilter: 'none',
  },
  {
    id: 'clean',
    label: '清晰',
    description: '提亮纸面并压低杂色',
    canvasFilter: 'brightness(1.08) contrast(1.12) saturate(0.82)',
  },
  {
    id: 'gray',
    label: '灰度',
    description: '适合合同和资料归档',
    canvasFilter: 'grayscale(1) contrast(1.16) brightness(1.04)',
  },
  {
    id: 'contrast',
    label: '增强',
    description: '强化浅色文字和边缘',
    canvasFilter: 'contrast(1.38) brightness(1.05) saturate(0.7)',
  },
  {
    id: 'mono',
    label: '黑白',
    description: '压缩成黑白文档感',
    canvasFilter: 'grayscale(1) contrast(1.45) brightness(1.08)',
  },
]

export function getFilterPreset(filterId: ScanFilterId) {
  return (
    FILTER_PRESETS.find((preset) => preset.id === filterId) ??
    FILTER_PRESETS[0]
  )
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('文件读取结果不是有效图片地址'))
    }

    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = src
  })
}

export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0, scale: 0 }
  }

  const scale = Math.min(maxWidth / width, maxHeight / height, 1)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

export function getRotatedSize(
  width: number,
  height: number,
  rotation: number,
) {
  const normalized = normalizeRotation(rotation)

  if (normalized === 90 || normalized === 270) {
    return { width: height, height: width }
  }

  return { width, height }
}

export function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** exponent

  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

export function createPageName(index: number, fileName?: string) {
  const baseName = fileName?.replace(/\.[^.]+$/, '').trim()

  if (baseName) {
    return baseName
  }

  return `扫描页 ${index + 1}`
}

export async function renderImageVariant(
  src: string,
  filterId: ScanFilterId,
  rotation = 0,
  maxLongEdge = 1800,
): Promise<RenderedImage> {
  const image = await loadImage(src)
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  const fitted = fitWithin(
    naturalWidth,
    naturalHeight,
    maxLongEdge,
    maxLongEdge,
  )
  const rotatedSize = getRotatedSize(fitted.width, fitted.height, rotation)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: filterId === 'mono' })

  if (!context) {
    throw new Error('当前浏览器不支持 Canvas 渲染')
  }

  canvas.width = rotatedSize.width
  canvas.height = rotatedSize.height
  context.save()
  context.fillStyle = '#fdfdf9'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((normalizeRotation(rotation) * Math.PI) / 180)
  context.filter = getFilterPreset(filterId).canvasFilter
  context.drawImage(
    image,
    -fitted.width / 2,
    -fitted.height / 2,
    fitted.width,
    fitted.height,
  )
  context.restore()

  if (filterId === 'mono') {
    applyMonoThreshold(context, canvas.width, canvas.height)
  }

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    width: canvas.width,
    height: canvas.height,
  }
}

export function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function applyMonoThreshold(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const imageData = context.getImageData(0, 0, width, height)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const luminance =
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const value = luminance > 172 ? 255 : 20
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
  }

  context.putImageData(imageData, 0, 0)
}
