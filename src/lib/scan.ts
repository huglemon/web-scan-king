import { fitWithin, loadImage } from './image'

export type CornerPoint = { x: number; y: number }

export type CornerKey =
  | 'topLeftCorner'
  | 'topRightCorner'
  | 'bottomLeftCorner'
  | 'bottomRightCorner'

export type CornerPoints = Record<CornerKey, CornerPoint>

declare global {
  interface Window {
    cv?: {
      Mat?: unknown
      onRuntimeInitialized?: () => void
    }
    __webScanKingOpenCvPromise?: Promise<void>
  }
}

const OPEN_CV_URL = 'https://docs.opencv.org/4.7.0/opencv.js'
const OPEN_CV_SCRIPT_ID = 'web-scan-king-opencv'

export type AutoScanResult = {
  dataUrl: string
  width: number
  height: number
}

export async function loadOpenCv(timeoutMs = 25000) {
  if (isOpenCvReady()) {
    return
  }

  if (window.__webScanKingOpenCvPromise) {
    return window.__webScanKingOpenCvPromise
  }

  const openCvPromise = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('OpenCV.js 加载超时，请检查网络后重试'))
    }, timeoutMs)

    const finish = () => {
      window.clearTimeout(timeout)
      resolve()
    }

    const waitForRuntime = () => {
      if (isOpenCvReady()) {
        finish()
        return
      }

      if (window.cv) {
        window.cv.onRuntimeInitialized = finish
      }

      const interval = window.setInterval(() => {
        if (isOpenCvReady()) {
          window.clearInterval(interval)
          finish()
        }
      }, 80)
    }

    const existingScript = document.getElementById(OPEN_CV_SCRIPT_ID)

    if (existingScript) {
      waitForRuntime()
      return
    }

    const script = document.createElement('script')
    script.id = OPEN_CV_SCRIPT_ID
    script.async = true
    script.src = OPEN_CV_URL
    script.onload = waitForRuntime
    script.onerror = () => {
      window.clearTimeout(timeout)
      reject(new Error('OpenCV.js 加载失败'))
    }

    document.body.appendChild(script)
  })

  window.__webScanKingOpenCvPromise = openCvPromise

  try {
    await openCvPromise
  } catch (error) {
    window.__webScanKingOpenCvPromise = undefined
    throw error
  }
}

export function isOpenCvReady() {
  return Boolean(window.cv?.Mat)
}

export async function autoExtractDocument(
  dataUrl: string,
): Promise<AutoScanResult> {
  await loadOpenCv()

  const [{ default: JScanify }, image] = await Promise.all([
    import('jscanify/client'),
    loadImage(dataUrl),
  ])
  const scanner = new JScanify()
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  const target = fitWithin(naturalWidth, naturalHeight, 1654, 2339)
  const canvas = scanner.extractPaper(image, target.width, target.height)

  if (!canvas) {
    throw new Error('没有识别到清晰的文档边缘')
  }

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height,
  }
}

export async function manualExtractDocument(
  dataUrl: string,
  cornerPoints: CornerPoints,
): Promise<AutoScanResult> {
  await loadOpenCv()

  const [{ default: JScanify }, image] = await Promise.all([
    import('jscanify/client'),
    loadImage(dataUrl),
  ])
  const scanner = new JScanify()
  const target = estimateManualTargetSize(cornerPoints)
  const canvas = scanner.extractPaper(
    image,
    target.width,
    target.height,
    cornerPoints,
  )

  if (!canvas) {
    throw new Error('手动边框无法生成有效扫描结果')
  }

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height,
  }
}

function estimateManualTargetSize(cornerPoints: CornerPoints) {
  const topWidth = distance(
    cornerPoints.topLeftCorner,
    cornerPoints.topRightCorner,
  )
  const bottomWidth = distance(
    cornerPoints.bottomLeftCorner,
    cornerPoints.bottomRightCorner,
  )
  const leftHeight = distance(
    cornerPoints.topLeftCorner,
    cornerPoints.bottomLeftCorner,
  )
  const rightHeight = distance(
    cornerPoints.topRightCorner,
    cornerPoints.bottomRightCorner,
  )

  return fitWithin(
    Math.max(topWidth, bottomWidth),
    Math.max(leftHeight, rightHeight),
    1654,
    2339,
  )
}

function distance(first: CornerPoint, second: CornerPoint) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}
