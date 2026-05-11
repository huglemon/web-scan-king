export type ScanFilterId =
  | 'original'
  | 'clean'
  | 'gray'
  | 'contrast'
  | 'mono'
  | 'sharp'
  | 'grayplus'
  | 'document'

type PixelEnhancementMode = 'none' | 'mono' | 'clarity' | 'gray' | 'document'

export type ScanFilterPreset = {
  id: ScanFilterId
  label: string
  description: string
  canvasFilter: string
  enhancement: PixelEnhancementMode
  defaultStrength?: number
}

export type RenderedImage = {
  dataUrl: string
  width: number
  height: number
}

export const DEFAULT_ENHANCE_STRENGTH = 62
export const MIN_ENHANCE_STRENGTH = 0
export const MAX_ENHANCE_STRENGTH = 100

export const FILTER_PRESETS: ScanFilterPreset[] = [
  {
    id: 'original',
    label: '原图',
    description: '保留拍摄色彩',
    canvasFilter: 'none',
    enhancement: 'none',
  },
  {
    id: 'clean',
    label: '清晰',
    description: '提亮纸面并压低杂色',
    canvasFilter: 'brightness(1.08) contrast(1.12) saturate(0.82)',
    enhancement: 'none',
  },
  {
    id: 'gray',
    label: '灰度',
    description: '适合合同和资料归档',
    canvasFilter: 'grayscale(1) contrast(1.16) brightness(1.04)',
    enhancement: 'none',
  },
  {
    id: 'contrast',
    label: '增强',
    description: '强化浅色文字和边缘',
    canvasFilter: 'contrast(1.38) brightness(1.05) saturate(0.7)',
    enhancement: 'none',
  },
  {
    id: 'mono',
    label: '黑白',
    description: '压缩成黑白文档感',
    canvasFilter: 'grayscale(1) contrast(1.45) brightness(1.08)',
    enhancement: 'mono',
  },
  {
    id: 'sharp',
    label: '清晰+',
    description: '去阴影、均匀纸面并增强文字边缘',
    canvasFilter: 'brightness(1.02) contrast(1.04) saturate(0.86)',
    enhancement: 'clarity',
    defaultStrength: 58,
  },
  {
    id: 'grayplus',
    label: '灰度+',
    description: '灰度增强、背景归一化和局部对比提升',
    canvasFilter: 'grayscale(1) brightness(1.02) contrast(1.05)',
    enhancement: 'gray',
    defaultStrength: 64,
  },
  {
    id: 'document',
    label: '黑白文档',
    description: '自适应黑白阈值，适合文字资料和合同',
    canvasFilter: 'grayscale(1) brightness(1.02) contrast(1.08)',
    enhancement: 'document',
    defaultStrength: 66,
  },
]

export function getFilterPreset(filterId: ScanFilterId) {
  return (
    FILTER_PRESETS.find((preset) => preset.id === filterId) ??
    FILTER_PRESETS[0]
  )
}

export function filterSupportsEnhanceStrength(filterId: ScanFilterId) {
  return getFilterPreset(filterId).defaultStrength !== undefined
}

export function normalizeEnhanceStrength(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_ENHANCE_STRENGTH
  }

  return Math.round(
    Math.min(
      Math.max(value, MIN_ENHANCE_STRENGTH),
      MAX_ENHANCE_STRENGTH,
    ),
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
  enhanceStrength = DEFAULT_ENHANCE_STRENGTH,
): Promise<RenderedImage> {
  const image = await loadImage(src)
  const preset = getFilterPreset(filterId)
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
  const context = canvas.getContext('2d', {
    willReadFrequently: preset.enhancement !== 'none',
  })

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
  context.filter = preset.canvasFilter
  context.drawImage(
    image,
    -fitted.width / 2,
    -fitted.height / 2,
    fitted.width,
    fitted.height,
  )
  context.restore()

  if (preset.enhancement !== 'none') {
    applyPixelEnhancement(
      context,
      canvas.width,
      canvas.height,
      preset.enhancement,
      enhanceStrength,
    )
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

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function applyPixelEnhancement(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  mode: PixelEnhancementMode,
  strength: number,
) {
  const imageData = context.getImageData(0, 0, width, height)

  if (mode === 'mono') {
    applyMonoThresholdToPixels(imageData.data)
  } else if (mode !== 'none') {
    const enhanced = enhancePixels(imageData.data, width, height, {
      mode,
      strength,
    })
    imageData.data.set(enhanced)
  }

  context.putImageData(imageData, 0, 0)
}

export type EnhancePixelsOptions = {
  mode: Exclude<PixelEnhancementMode, 'none' | 'mono'>
  strength: number
}

export function enhancePixels(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  options: EnhancePixelsOptions,
) {
  const output = new Uint8ClampedArray(source)
  const pixelCount = width * height

  if (pixelCount <= 0 || source.length < pixelCount * 4) {
    return output
  }

  const strength = normalizeEnhanceStrength(options.strength) / 100
  const luminance = extractLuminance(source, pixelCount)
  const background = estimateBackground(luminance, width, height)
  const normalized = normalizeBackground(luminance, background, strength)
  const contrast = applyLocalContrast(normalized, options.mode, strength)
  const sharpened = sharpenLuminance(
    contrast,
    width,
    height,
    options.mode === 'document' ? 0.32 + strength * 0.5 : strength * 0.72,
  )

  if (options.mode === 'document') {
    applyAdaptiveDocumentMode(output, sharpened, strength)
    return output
  }

  applyToneMode(output, source, luminance, sharpened, options.mode, strength)
  return output
}

function applyMonoThresholdToPixels(data: Uint8ClampedArray) {
  for (let index = 0; index < data.length; index += 4) {
    const luminance =
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const value = luminance > 172 ? 255 : 20
    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
  }
}

function extractLuminance(source: Uint8ClampedArray, pixelCount: number) {
  const luminance = new Float32Array(pixelCount)

  for (let pixel = 0, index = 0; pixel < pixelCount; pixel += 1, index += 4) {
    luminance[pixel] =
      source[index] * 0.299 +
      source[index + 1] * 0.587 +
      source[index + 2] * 0.114
  }

  return luminance
}

function estimateBackground(
  luminance: Float32Array,
  width: number,
  height: number,
) {
  const blockSize = Math.max(8, Math.round(Math.min(width, height) / 72))
  const gridWidth = Math.ceil(width / blockSize)
  const gridHeight = Math.ceil(height / blockSize)
  const grid = new Float32Array(gridWidth * gridHeight)

  for (let y = 0; y < height; y += 1) {
    const gridY = Math.floor(y / blockSize)

    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x
      const gridIndex = gridY * gridWidth + Math.floor(x / blockSize)
      grid[gridIndex] = Math.max(grid[gridIndex], luminance[pixel])
    }
  }

  const blurredGrid = blurGrid(
    grid,
    gridWidth,
    gridHeight,
    Math.max(1, Math.round(Math.min(gridWidth, gridHeight) / 24)),
  )
  const background = new Float32Array(width * height)

  for (let y = 0; y < height; y += 1) {
    const gridY = Math.min(gridHeight - 1, y / blockSize)
    const y0 = Math.floor(gridY)
    const y1 = Math.min(gridHeight - 1, y0 + 1)
    const yMix = gridY - y0

    for (let x = 0; x < width; x += 1) {
      const gridX = Math.min(gridWidth - 1, x / blockSize)
      const x0 = Math.floor(gridX)
      const x1 = Math.min(gridWidth - 1, x0 + 1)
      const xMix = gridX - x0
      const top = lerp(
        blurredGrid[y0 * gridWidth + x0],
        blurredGrid[y0 * gridWidth + x1],
        xMix,
      )
      const bottom = lerp(
        blurredGrid[y1 * gridWidth + x0],
        blurredGrid[y1 * gridWidth + x1],
        xMix,
      )
      background[y * width + x] = Math.max(72, lerp(top, bottom, yMix))
    }
  }

  return background
}

function blurGrid(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
) {
  let current = source

  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Float32Array(current.length)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0
        let count = 0

        for (
          let sampleY = Math.max(0, y - radius);
          sampleY <= Math.min(height - 1, y + radius);
          sampleY += 1
        ) {
          for (
            let sampleX = Math.max(0, x - radius);
            sampleX <= Math.min(width - 1, x + radius);
            sampleX += 1
          ) {
            sum += current[sampleY * width + sampleX]
            count += 1
          }
        }

        next[y * width + x] = count > 0 ? sum / count : current[y * width + x]
      }
    }

    current = next
  }

  return current
}

function normalizeBackground(
  luminance: Float32Array,
  background: Float32Array,
  strength: number,
) {
  const normalized = new Float32Array(luminance.length)
  const targetPaper = 238
  const shadowStrength = 0.28 + strength * 0.72

  for (let index = 0; index < luminance.length; index += 1) {
    const balanced = (luminance[index] * targetPaper) / background[index]
    normalized[index] = clampChannel(
      lerp(luminance[index], balanced, shadowStrength),
    )
  }

  return normalized
}

function applyLocalContrast(
  luminance: Float32Array,
  mode: EnhancePixelsOptions['mode'],
  strength: number,
) {
  const output = new Float32Array(luminance.length)
  const anchor = mode === 'document' ? 218 : 212
  const inkBoost =
    mode === 'document' ? 0.34 + strength * 0.18 : 0.15 + strength * 0.18
  const paperBoost =
    mode === 'document' ? 0.08 + strength * 0.12 : 0.03 + strength * 0.06

  for (let index = 0; index < luminance.length; index += 1) {
    const value = luminance[index]
    const darker = Math.max(0, anchor - value)
    const lighter = Math.max(0, value - anchor)
    output[index] = clampChannel(value - darker * inkBoost + lighter * paperBoost)
  }

  return output
}

function sharpenLuminance(
  luminance: Float32Array,
  width: number,
  height: number,
  amount: number,
) {
  if (width < 3 || height < 3 || amount <= 0) {
    return luminance
  }

  const output = new Float32Array(luminance)

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x
      const center = luminance[pixel]
      const blurred =
        (center * 4 +
          luminance[pixel - 1] * 2 +
          luminance[pixel + 1] * 2 +
          luminance[pixel - width] * 2 +
          luminance[pixel + width] * 2 +
          luminance[pixel - width - 1] +
          luminance[pixel - width + 1] +
          luminance[pixel + width - 1] +
          luminance[pixel + width + 1]) /
        16
      output[pixel] = clampChannel(center + (center - blurred) * amount)
    }
  }

  return output
}

function applyAdaptiveDocumentMode(
  output: Uint8ClampedArray,
  luminance: Float32Array,
  strength: number,
) {
  const threshold = 190 + strength * 24
  const ink = strength > 0.72 ? 10 : 18

  for (let pixel = 0, index = 0; pixel < luminance.length; pixel += 1, index += 4) {
    const value = luminance[pixel] < threshold ? ink : 255
    output[index] = value
    output[index + 1] = value
    output[index + 2] = value
    output[index + 3] = sourceAlpha(output[index + 3])
  }
}

function applyToneMode(
  output: Uint8ClampedArray,
  source: Uint8ClampedArray,
  originalLuminance: Float32Array,
  luminance: Float32Array,
  mode: EnhancePixelsOptions['mode'],
  strength: number,
) {
  const desaturate = mode === 'gray' ? 1 : 0.16 + strength * 0.22

  for (let pixel = 0, index = 0; pixel < luminance.length; pixel += 1, index += 4) {
    const finalLuminance = luminance[pixel]

    if (mode === 'gray') {
      const gray = clampChannel(finalLuminance)
      output[index] = gray
      output[index + 1] = gray
      output[index + 2] = gray
      output[index + 3] = sourceAlpha(source[index + 3])
      continue
    }

    const ratio = finalLuminance / Math.max(1, originalLuminance[pixel])
    output[index] = clampChannel(
      lerp(source[index] * ratio, finalLuminance, desaturate),
    )
    output[index + 1] = clampChannel(
      lerp(source[index + 1] * ratio, finalLuminance, desaturate),
    )
    output[index + 2] = clampChannel(
      lerp(source[index + 2] * ratio, finalLuminance, desaturate),
    )
    output[index + 3] = sourceAlpha(source[index + 3])
  }
}

function sourceAlpha(value: number) {
  return Number.isFinite(value) ? value : 255
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function clampChannel(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 255))
}
