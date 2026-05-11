import type { CornerPoint } from './scan'

export type DisplayRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

export function mapClientPointToImagePoint(
  clientX: number,
  clientY: number,
  rect: DisplayRect,
  imageWidth: number,
  imageHeight: number,
): CornerPoint {
  return {
    x: clamp(((clientX - rect.left) / rect.width) * imageWidth, 0, imageWidth),
    y: clamp(((clientY - rect.top) / rect.height) * imageHeight, 0, imageHeight),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
