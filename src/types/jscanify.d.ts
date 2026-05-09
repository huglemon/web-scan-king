declare module 'jscanify/client' {
  type CornerPoint = { x: number; y: number }

  type CornerPoints = {
    topLeftCorner: CornerPoint
    topRightCorner: CornerPoint
    bottomLeftCorner: CornerPoint
    bottomRightCorner: CornerPoint
  }

  export default class JScanify {
    highlightPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      options?: { color?: string; thickness?: number },
    ): HTMLCanvasElement

    findPaperContour(image: unknown): unknown | null

    getCornerPoints(contour: unknown): Partial<CornerPoints>

    extractPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: CornerPoints,
    ): HTMLCanvasElement | null
  }
}
