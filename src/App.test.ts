import { describe, expect, it } from 'vitest'
import {
  calculateContainedFrameSize,
  mapClientPointToImagePoint,
  moveFrameEdge,
} from './lib/frame'

describe('manual frame coordinate mapping', () => {
  it('maps pointer positions against the displayed image rectangle', () => {
    expect(
      mapClientPointToImagePoint(
        150,
        220,
        { left: 100, top: 200, width: 250, height: 400 },
        1000,
        1600,
      ),
    ).toEqual({ x: 200, y: 80 })
  })

  it('clamps dragged corners inside the original image bounds', () => {
    expect(
      mapClientPointToImagePoint(
        20,
        900,
        { left: 100, top: 200, width: 250, height: 400 },
        1000,
        1600,
      ),
    ).toEqual({ x: 0, y: 1600 })
  })
})

describe('manual frame image sizing', () => {
  it('fits tall images entirely inside the editor canvas', () => {
    const size = calculateContainedFrameSize(320, 520, 1000, 1800)

    expect(size?.width).toBeCloseTo(288.89)
    expect(size?.height).toBe(520)
  })

  it('fits wide images entirely inside the editor canvas', () => {
    const size = calculateContainedFrameSize(320, 520, 1800, 1000)

    expect(size?.width).toBe(320)
    expect(size?.height).toBeCloseTo(177.78)
  })
})

describe('manual frame edge dragging', () => {
  const corners = {
    topLeftCorner: { x: 100, y: 120 },
    topRightCorner: { x: 680, y: 150 },
    bottomLeftCorner: { x: 90, y: 920 },
    bottomRightCorner: { x: 700, y: 900 },
  }

  it('moves one edge while preserving the edge angle', () => {
    expect(moveFrameEdge('topEdge', corners, { x: 40, y: 80 }, 800, 1000)).toEqual({
      ...corners,
      topLeftCorner: { x: 100, y: 200 },
      topRightCorner: { x: 680, y: 230 },
    })
  })

  it('keeps dragged edges from crossing the opposite edge', () => {
    const moved = moveFrameEdge(
      'leftEdge',
      corners,
      { x: 900, y: 0 },
      800,
      1000,
    )

    expect(moved.topLeftCorner.x).toBeLessThan(moved.topRightCorner.x)
    expect(moved.bottomLeftCorner.x).toBeLessThan(moved.bottomRightCorner.x)
  })
})
