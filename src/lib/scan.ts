import { fitWithin, loadImage } from './image'
import type JScanify from 'jscanify/client'

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
const DETECTION_MAX_EDGE = 1280
const MIN_DOCUMENT_AREA_RATIO = 0.045

export type ExtractDocumentResult = {
  dataUrl: string
  width: number
  height: number
}

export type AutoScanResult = ExtractDocumentResult & {
  cropCorners: CornerPoints
}

type PartialCornerPoints = Partial<Record<CornerKey, CornerPoint>>

type ManagedMat = {
  cols: number
  rows: number
  data32S: Int32Array
  delete: () => void
}

type ManagedMatVector = {
  size: () => number
  get: (index: number) => ManagedMat
  delete: () => void
}

type OpenCvRuntime = {
  Mat: new () => ManagedMat
  MatVector: new () => ManagedMatVector
  Size: new (width: number, height: number) => unknown
  imread: (image: HTMLImageElement | HTMLCanvasElement) => ManagedMat
  resize: (
    src: ManagedMat,
    dst: ManagedMat,
    dsize: unknown,
    fx: number,
    fy: number,
    interpolation: number,
  ) => void
  cvtColor: (src: ManagedMat, dst: ManagedMat, code: number) => void
  GaussianBlur: (
    src: ManagedMat,
    dst: ManagedMat,
    ksize: unknown,
    sigmaX: number,
    sigmaY: number,
    borderType: number,
  ) => void
  Canny: (
    src: ManagedMat,
    dst: ManagedMat,
    threshold1: number,
    threshold2: number,
  ) => void
  threshold: (
    src: ManagedMat,
    dst: ManagedMat,
    thresh: number,
    maxval: number,
    type: number,
  ) => void
  adaptiveThreshold: (
    src: ManagedMat,
    dst: ManagedMat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    c: number,
  ) => void
  dilate: (src: ManagedMat, dst: ManagedMat, kernel: ManagedMat) => void
  findContours: (
    image: ManagedMat,
    contours: ManagedMatVector,
    hierarchy: ManagedMat,
    mode: number,
    method: number,
  ) => void
  contourArea: (contour: ManagedMat) => number
  arcLength: (curve: ManagedMat, closed: boolean) => number
  approxPolyDP: (
    curve: ManagedMat,
    approxCurve: ManagedMat,
    epsilon: number,
    closed: boolean,
  ) => void
  isContourConvex: (contour: ManagedMat) => boolean
  COLOR_RGBA2GRAY: number
  BORDER_DEFAULT: number
  INTER_AREA: number
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
  THRESH_BINARY: number
  THRESH_BINARY_INV: number
  THRESH_OTSU: number
  ADAPTIVE_THRESH_GAUSSIAN_C: number
}

type DetectionCandidate = {
  corners: CornerPoints
  score: number
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
  const cropCorners = detectDocumentCorners(image, scanner)
  const target = estimateManualTargetSize(cropCorners)
  const canvas = scanner.extractPaper(
    image,
    target.width,
    target.height,
    cropCorners,
  )

  if (!canvas) {
    throw new Error('没有识别到清晰的文档边缘')
  }

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height,
    cropCorners,
  }
}

export async function manualExtractDocument(
  dataUrl: string,
  cornerPoints: CornerPoints,
): Promise<ExtractDocumentResult> {
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

function detectDocumentCorners(
  image: HTMLImageElement,
  scanner: JScanify,
): CornerPoints {
  const cv = getOpenCvRuntime()
  const src = cv.imread(image)
  const candidates: DetectionCandidate[] = []
  const working = createWorkingMat(cv, src)

  try {
    const gray = new cv.Mat()
    const blurred = new cv.Mat()

    try {
      cv.cvtColor(working.mat, gray, cv.COLOR_RGBA2GRAY)
      cv.GaussianBlur(
        gray,
        blurred,
        new cv.Size(5, 5),
        0,
        0,
        cv.BORDER_DEFAULT,
      )

      collectCannyCandidates(cv, scanner, blurred, working, candidates)
      collectThresholdCandidates(cv, scanner, gray, blurred, working, candidates)
      collectJscanifyCandidate(cv, scanner, working, candidates)
    } finally {
      gray.delete()
      blurred.delete()
    }
  } finally {
    if (working.shouldDelete) {
      working.mat.delete()
    }
    src.delete()
  }

  const best = candidates.sort((first, second) => second.score - first.score)[0]

  if (!best) {
    throw new Error('没有识别到完整的文档四角')
  }

  return best.corners
}

function getOpenCvRuntime() {
  if (!isOpenCvReady()) {
    throw new Error('OpenCV.js 尚未就绪')
  }

  return window.cv as unknown as OpenCvRuntime
}

function createWorkingMat(cv: OpenCvRuntime, src: ManagedMat) {
  const maxEdge = Math.max(src.cols, src.rows)
  const scale = Math.min(DETECTION_MAX_EDGE / maxEdge, 1)

  if (scale >= 1) {
    return {
      mat: src,
      shouldDelete: false,
      scaleX: 1,
      scaleY: 1,
      width: src.cols,
      height: src.rows,
    }
  }

  const resized = new cv.Mat()
  const width = Math.max(1, Math.round(src.cols * scale))
  const height = Math.max(1, Math.round(src.rows * scale))
  cv.resize(
    src,
    resized,
    new cv.Size(width, height),
    0,
    0,
    cv.INTER_AREA,
  )

  return {
    mat: resized,
    shouldDelete: true,
    scaleX: src.cols / resized.cols,
    scaleY: src.rows / resized.rows,
    width: resized.cols,
    height: resized.rows,
  }
}

function collectCannyCandidates(
  cv: OpenCvRuntime,
  scanner: JScanify,
  blurred: ManagedMat,
  working: ReturnType<typeof createWorkingMat>,
  candidates: DetectionCandidate[],
) {
  const thresholds: Array<[number, number]> = [
    [30, 110],
    [50, 160],
    [80, 220],
  ]

  for (const [low, high] of thresholds) {
    const edges = new cv.Mat()
    const dilated = new cv.Mat()
    const kernel = new cv.Mat()

    try {
      cv.Canny(blurred, edges, low, high)
      cv.dilate(edges, dilated, kernel)
      collectContourCandidates(cv, scanner, dilated, working, candidates)
    } finally {
      edges.delete()
      dilated.delete()
      kernel.delete()
    }
  }
}

function collectThresholdCandidates(
  cv: OpenCvRuntime,
  scanner: JScanify,
  gray: ManagedMat,
  blurred: ManagedMat,
  working: ReturnType<typeof createWorkingMat>,
  candidates: DetectionCandidate[],
) {
  const thresholdModes = [cv.THRESH_BINARY, cv.THRESH_BINARY_INV]

  for (const mode of thresholdModes) {
    const threshold = new cv.Mat()

    try {
      cv.threshold(blurred, threshold, 0, 255, mode + cv.THRESH_OTSU)
      collectContourCandidates(cv, scanner, threshold, working, candidates)
    } finally {
      threshold.delete()
    }
  }

  const adaptive = new cv.Mat()

  try {
    cv.adaptiveThreshold(
      gray,
      adaptive,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      31,
      8,
    )
    collectContourCandidates(cv, scanner, adaptive, working, candidates)
  } finally {
    adaptive.delete()
  }
}

function collectJscanifyCandidate(
  cv: OpenCvRuntime,
  scanner: JScanify,
  working: ReturnType<typeof createWorkingMat>,
  candidates: DetectionCandidate[],
) {
  const contour = scanner.findPaperContour(working.mat) as ManagedMat | null

  if (!contour) {
    return
  }

  try {
    const corners = normalizeCornerPoints(scanner.getCornerPoints(contour))
    addCandidate(corners, cv.contourArea(contour), working, candidates)
  } finally {
    contour.delete()
  }
}

function collectContourCandidates(
  cv: OpenCvRuntime,
  scanner: JScanify,
  contourSource: ManagedMat,
  working: ReturnType<typeof createWorkingMat>,
  candidates: DetectionCandidate[],
) {
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()

  try {
    cv.findContours(
      contourSource,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    )

    const minArea = working.width * working.height * MIN_DOCUMENT_AREA_RATIO

    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)

      try {
        const contourArea = cv.contourArea(contour)

        if (contourArea < minArea) {
          continue
        }

        collectPolygonCandidates(cv, contour, contourArea, working, candidates)

        const corners = normalizeCornerPoints(scanner.getCornerPoints(contour))
        addCandidate(corners, contourArea, working, candidates)
      } finally {
        contour.delete()
      }
    }
  } finally {
    contours.delete()
    hierarchy.delete()
  }
}

function collectPolygonCandidates(
  cv: OpenCvRuntime,
  contour: ManagedMat,
  contourArea: number,
  working: ReturnType<typeof createWorkingMat>,
  candidates: DetectionCandidate[],
) {
  const perimeter = cv.arcLength(contour, true)

  if (perimeter <= 0) {
    return
  }

  const epsilons = [0.012, 0.018, 0.026, 0.036, 0.052]

  for (const epsilon of epsilons) {
    const approx = new cv.Mat()

    try {
      cv.approxPolyDP(contour, approx, perimeter * epsilon, true)

      if (approx.rows !== 4 || !cv.isContourConvex(approx)) {
        continue
      }

      addCandidate(
        normalizeCornerPoints(cornersFromMat(approx)),
        contourArea,
        working,
        candidates,
      )
    } finally {
      approx.delete()
    }
  }
}

function addCandidate(
  corners: CornerPoints | null,
  contourArea: number,
  working: ReturnType<typeof createWorkingMat>,
  candidates: DetectionCandidate[],
) {
  if (!corners) {
    return
  }

  const score = scoreCorners(corners, contourArea, working.width, working.height)

  if (score === null) {
    return
  }

  candidates.push({
    corners: scaleCorners(corners, working.scaleX, working.scaleY),
    score,
  })
}

function cornersFromMat(mat: ManagedMat): CornerPoint[] {
  const points: CornerPoint[] = []

  for (let index = 0; index < mat.data32S.length; index += 2) {
    points.push({ x: mat.data32S[index], y: mat.data32S[index + 1] })
  }

  return points
}

export function normalizeCornerPoints(
  input: PartialCornerPoints | CornerPoint[],
): CornerPoints | null {
  const points = Array.isArray(input)
    ? input
    : [
        input.topLeftCorner,
        input.topRightCorner,
        input.bottomRightCorner,
        input.bottomLeftCorner,
      ]

  const completePoints = points.filter(isFinitePoint)

  if (completePoints.length !== 4) {
    return null
  }

  return orderCornerPoints(completePoints)
}

export function orderCornerPoints(points: CornerPoint[]): CornerPoints | null {
  if (points.length !== 4) {
    return null
  }

  const sortedByY = [...points].sort((first, second) =>
    first.y === second.y ? first.x - second.x : first.y - second.y,
  )
  const top = sortedByY.slice(0, 2).sort((first, second) => first.x - second.x)
  const bottom = sortedByY
    .slice(2)
    .sort((first, second) => first.x - second.x)
  const corners = {
    topLeftCorner: { ...top[0] },
    topRightCorner: { ...top[1] },
    bottomLeftCorner: { ...bottom[0] },
    bottomRightCorner: { ...bottom[1] },
  }

  if (new Set(Object.values(corners).map((point) => `${point.x}:${point.y}`)).size !== 4) {
    return null
  }

  return corners
}

function isFinitePoint(point: CornerPoint | undefined): point is CornerPoint {
  return (
    Boolean(point) &&
    Number.isFinite(point?.x) &&
    Number.isFinite(point?.y)
  )
}

function scoreCorners(
  corners: CornerPoints,
  contourArea: number,
  imageWidth: number,
  imageHeight: number,
) {
  const quadArea = polygonArea([
    corners.topLeftCorner,
    corners.topRightCorner,
    corners.bottomRightCorner,
    corners.bottomLeftCorner,
  ])
  const imageArea = imageWidth * imageHeight
  const areaRatio = quadArea / imageArea

  if (
    !Number.isFinite(areaRatio) ||
    areaRatio < MIN_DOCUMENT_AREA_RATIO ||
    areaRatio > 1.08
  ) {
    return null
  }

  const topWidth = distance(corners.topLeftCorner, corners.topRightCorner)
  const bottomWidth = distance(corners.bottomLeftCorner, corners.bottomRightCorner)
  const leftHeight = distance(corners.topLeftCorner, corners.bottomLeftCorner)
  const rightHeight = distance(corners.topRightCorner, corners.bottomRightCorner)
  const averageWidth = (topWidth + bottomWidth) / 2
  const averageHeight = (leftHeight + rightHeight) / 2
  const aspectRatio = averageWidth / averageHeight

  if (
    averageWidth < 16 ||
    averageHeight < 16 ||
    aspectRatio < 0.18 ||
    aspectRatio > 5.5
  ) {
    return null
  }

  const widthBalance = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth)
  const heightBalance = Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight)
  const fillRatio = Math.min(contourArea / quadArea, 1)
  const center = getCornerCenter(corners)
  const centerDistance = Math.hypot(
    center.x / imageWidth - 0.5,
    center.y / imageHeight - 0.5,
  )
  const centerScore = Math.max(0, 1 - centerDistance * 1.6)

  return areaRatio * 3 + widthBalance + heightBalance + fillRatio + centerScore
}

function polygonArea(points: CornerPoint[]) {
  let area = 0

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }

  return Math.abs(area / 2)
}

function getCornerCenter(corners: CornerPoints) {
  const points = [
    corners.topLeftCorner,
    corners.topRightCorner,
    corners.bottomRightCorner,
    corners.bottomLeftCorner,
  ]

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
}

function scaleCorners(
  corners: CornerPoints,
  scaleX: number,
  scaleY: number,
): CornerPoints {
  return {
    topLeftCorner: scalePoint(corners.topLeftCorner, scaleX, scaleY),
    topRightCorner: scalePoint(corners.topRightCorner, scaleX, scaleY),
    bottomLeftCorner: scalePoint(corners.bottomLeftCorner, scaleX, scaleY),
    bottomRightCorner: scalePoint(corners.bottomRightCorner, scaleX, scaleY),
  }
}

function scalePoint(point: CornerPoint, scaleX: number, scaleY: number) {
  return {
    x: point.x * scaleX,
    y: point.y * scaleY,
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
