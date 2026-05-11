import type { CornerPoint, CornerPoints } from './scan'

export type DisplayRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
export type FrameEdgeKey = 'topEdge' | 'rightEdge' | 'bottomEdge' | 'leftEdge'
export type FrameSize = {
  width: number
  height: number
}

export function calculateContainedFrameSize(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): FrameSize | null {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null
  }

  const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight)

  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
  }
}

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

export function moveFrameEdge(
  edge: FrameEdgeKey,
  corners: CornerPoints,
  delta: CornerPoint,
  imageWidth: number,
  imageHeight: number,
): CornerPoints {
  const minGap = Math.max(8, Math.min(imageWidth, imageHeight) * 0.02)

  if (edge === 'topEdge') {
    const amount = clamp(
      delta.y,
      -Math.min(corners.topLeftCorner.y, corners.topRightCorner.y),
      Math.min(
        corners.bottomLeftCorner.y - corners.topLeftCorner.y - minGap,
        corners.bottomRightCorner.y - corners.topRightCorner.y - minGap,
      ),
    )

    return {
      ...corners,
      topLeftCorner: movePoint(corners.topLeftCorner, 0, amount, imageWidth, imageHeight),
      topRightCorner: movePoint(corners.topRightCorner, 0, amount, imageWidth, imageHeight),
    }
  }

  if (edge === 'bottomEdge') {
    const amount = clamp(
      delta.y,
      Math.max(
        corners.topLeftCorner.y + minGap - corners.bottomLeftCorner.y,
        corners.topRightCorner.y + minGap - corners.bottomRightCorner.y,
      ),
      imageHeight - Math.max(corners.bottomLeftCorner.y, corners.bottomRightCorner.y),
    )

    return {
      ...corners,
      bottomLeftCorner: movePoint(
        corners.bottomLeftCorner,
        0,
        amount,
        imageWidth,
        imageHeight,
      ),
      bottomRightCorner: movePoint(
        corners.bottomRightCorner,
        0,
        amount,
        imageWidth,
        imageHeight,
      ),
    }
  }

  if (edge === 'leftEdge') {
    const amount = clamp(
      delta.x,
      -Math.min(corners.topLeftCorner.x, corners.bottomLeftCorner.x),
      Math.min(
        corners.topRightCorner.x - corners.topLeftCorner.x - minGap,
        corners.bottomRightCorner.x - corners.bottomLeftCorner.x - minGap,
      ),
    )

    return {
      ...corners,
      topLeftCorner: movePoint(corners.topLeftCorner, amount, 0, imageWidth, imageHeight),
      bottomLeftCorner: movePoint(
        corners.bottomLeftCorner,
        amount,
        0,
        imageWidth,
        imageHeight,
      ),
    }
  }

  const amount = clamp(
    delta.x,
    Math.max(
      corners.topLeftCorner.x + minGap - corners.topRightCorner.x,
      corners.bottomLeftCorner.x + minGap - corners.bottomRightCorner.x,
    ),
    imageWidth - Math.max(corners.topRightCorner.x, corners.bottomRightCorner.x),
  )

  return {
    ...corners,
    topRightCorner: movePoint(corners.topRightCorner, amount, 0, imageWidth, imageHeight),
    bottomRightCorner: movePoint(
      corners.bottomRightCorner,
      amount,
      0,
      imageWidth,
      imageHeight,
    ),
  }
}

function movePoint(
  point: CornerPoint,
  deltaX: number,
  deltaY: number,
  imageWidth: number,
  imageHeight: number,
) {
  return {
    x: clamp(point.x + deltaX, 0, imageWidth),
    y: clamp(point.y + deltaY, 0, imageHeight),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
